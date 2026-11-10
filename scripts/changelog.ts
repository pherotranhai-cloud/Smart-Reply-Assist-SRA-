#!/usr/bin/env tsx
/**
 * Generates the "Mới cập nhật" (what's new) popup from git history.
 *
 *   npm run changelog              # write a new release if there is one
 *   npm run changelog -- --dry-run # print what would be written, change nothing
 *   npm run changelog -- --from <git-ref>   # override the starting commit
 *
 * 1. Reads src/config/changelog.json; the newest release's `commit` is where
 *    the previous notes stopped.
 * 2. Collects the commits after it (`git log <commit>..HEAD --no-merges`).
 * 3. Asks Claude (shared/modelConfig.ts, task 'changelog') whether any of them
 *    change something a user would notice and, if so, to write 3-5 short
 *    Vietnamese lines in the popup's style.
 * 4. Internal-only work → nothing is written and the popup stays shut.
 *    Otherwise the next minor version is prepended as a new release, and
 *    package.json is moved up to it so the version shown in Settings agrees.
 *
 * Needs ANTHROPIC_API_KEY. Runs in CI via .github/workflows/changelog.yml.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APP_ENGINE_ID,
  createMessage,
  extractText,
  getAnthropic,
  isClaudeConfigured,
  resolveModel,
} from '../shared/modelConfig';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG_PATH = join(ROOT, 'src/config/changelog.json');
const PKG_PATH = join(ROOT, 'package.json');

/** Commits made by this script (or its CI job) are never release material. */
export const BOT_COMMIT_PREFIX = 'chore(changelog)';
const MAX_RELEASES_KEPT = 20;
const MAX_PROMPT_CHARS = 60_000;

export interface Release {
  version: string;
  date: string;
  commit: string;
  features: string[];
}

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

/** "v2.14.0" or "2.14.0" -> [2, 14, 0]; anything else -> null. */
export function parseVersion(v: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** The next minor release after whichever is higher: the last release or package.json. */
export function nextReleaseVersion(lastRelease: string | undefined, pkgVersion: string): string {
  const candidates = [lastRelease, pkgVersion]
    .map((v) => (v ? parseVersion(v) : null))
    .filter((v): v is [number, number, number] => v !== null);
  if (candidates.length === 0) throw new Error('No parseable version in changelog.json or package.json');
  const [major, minor] = candidates.sort(compare).at(-1)!;
  return `v${major}.${minor + 1}.0`;
}

/** Drops attribution trailers and blank noise so the model sees only what changed. */
export function cleanBody(body: string): string {
  return body
    .split('\n')
    .filter((line) => !/^(Co-Authored-By|Claude-Session|Signed-off-by):/i.test(line.trim()))
    .join('\n')
    .trim();
}

export function parseGitLog(raw: string): Commit[] {
  return raw
    .split('\x1e')
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, subject = '', body = ''] = rec.split('\x1f');
      return { sha: sha.trim(), subject: subject.trim(), body: cleanBody(body) };
    })
    .filter((c) => c.sha && !c.subject.startsWith(BOT_COMMIT_PREFIX));
}

function commitsSince(from: string): Commit[] {
  try {
    git('cat-file', '-e', `${from}^{commit}`);
  } catch {
    throw new Error(
      `Commit ${from} (the last release's "commit") is not in this checkout. ` +
        'Fetch full history (git fetch --unshallow) or pass --from <ref>.'
    );
  }
  return parseGitLog(git('log', '--no-merges', '--format=%H%x1f%s%x1f%b%x1e', `${from}..HEAD`));
}

export function buildPrompt(commits: Commit[]): string {
  let text = '';
  for (const c of commits) {
    const entry = `### ${c.subject}\n${c.body.slice(0, 1500)}\n\n`;
    if (text.length + entry.length > MAX_PROMPT_CHARS) {
      text += `(... ${commits.length} commits in total; the rest were cut for length)\n`;
      break;
    }
    text += entry;
  }
  return text;
}

const SYSTEM_PROMPT = `You write the "Mới cập nhật" (what's new) popup for Smart Reply Assist, a translation and message-composition app used by factory-floor staff in Vietnam. You are given the git commits merged since the last popup.

Decide whether any commit changes something an ordinary user would notice: a new or removed feature, a visible UI change, a fixed bug they could have hit, better translation/compose behaviour. Refactors, tests, docs, build/CI, dependency bumps, server-only config and internal cleanups are NOT user-facing.

If nothing is user-facing, return {"user_facing": false, "features": []}.

Otherwise return {"user_facing": true, "features": [...]} with 3 to 5 lines (fewer only if there are fewer real changes), each:
- in Vietnamese, plain everyday language, one sentence, under ~20 words;
- describing what the user notices or can now do — never the implementation (no file names, API names, environment variables, "refactor", "endpoint");
- wrapping the one or two key words in **double asterisks**;
- most important change first; merge related commits into one line; never invent a change the commits do not show.

Example lines in the house style:
"**Cài đặt gọn hơn**: chỉ còn **một** mục chọn giao diện, có thêm tuỳ chọn **Theo hệ thống**"
"Hình nền **hiển thị đúng tên mẫu giày**, và bạn có thể **tải nhiều ảnh từ máy** rồi tự đặt tên"`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    user_facing: { type: 'boolean' },
    features: { type: 'array', items: { type: 'string' } },
  },
  required: ['user_facing', 'features'],
  additionalProperties: false,
};

async function writeNotes(commits: Commit[]): Promise<{ user_facing: boolean; features: string[] }> {
  const response = await createMessage(getAnthropic(), 'changelog', {
    model: resolveModel(process.env.CHANGELOG_MODEL || APP_ENGINE_ID),
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `COMMITS SINCE THE LAST POPUP:\n\n${buildPrompt(commits)}` }],
    jsonSchema: RESPONSE_SCHEMA,
  });
  if (response.stop_reason === 'refusal') throw new Error('Claude declined to write the release notes.');
  if (response.stop_reason === 'max_tokens') throw new Error('Release notes were cut off (max_tokens).');
  const parsed = JSON.parse(extractText(response));
  const features = (parsed.features as unknown[])
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map((f) => f.trim())
    .slice(0, 5);
  return { user_facing: parsed.user_facing === true && features.length > 0, features };
}

function parseArgs(argv: string[]) {
  const args = { dryRun: false, from: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--from') args.from = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const changelog = JSON.parse(readFileSync(CHANGELOG_PATH, 'utf-8')) as { releases: Release[] };
  const latest = changelog.releases[0];
  const from = args.from ?? latest?.commit;
  if (!from) throw new Error('changelog.json has no release to start from; pass --from <ref>.');

  const commits = commitsSince(from);
  console.log(`[changelog] ${commits.length} commit(s) since ${from.slice(0, 7)}.`);
  if (commits.length === 0) return;

  if (!isClaudeConfigured()) throw new Error('ANTHROPIC_API_KEY is not set.');
  const notes = await writeNotes(commits);
  if (!notes.user_facing) {
    console.log('[changelog] Internal-only changes; no new popup.');
    return;
  }

  const pkgRaw = readFileSync(PKG_PATH, 'utf-8');
  const pkgVersion = JSON.parse(pkgRaw).version as string;
  const release: Release = {
    version: nextReleaseVersion(latest?.version, pkgVersion),
    date: new Date().toISOString().slice(0, 10),
    commit: git('rev-parse', 'HEAD').trim(),
    features: notes.features,
  };

  console.log(`[changelog] New release ${release.version}:`);
  for (const f of release.features) console.log(`  - ${f}`);
  if (args.dryRun) {
    console.log('[changelog] --dry-run: nothing written.');
    return;
  }

  changelog.releases = [release, ...changelog.releases].slice(0, MAX_RELEASES_KEPT);
  writeFileSync(CHANGELOG_PATH, JSON.stringify(changelog, null, 2) + '\n');

  const nextPkg = release.version.slice(1);
  if (compare(parseVersion(nextPkg)!, parseVersion(pkgVersion)!) > 0) {
    writeFileSync(PKG_PATH, pkgRaw.replace(/^(\s*"version"\s*:\s*)"[^"]+"/m, (_m, p) => `${p}"${nextPkg}"`));
  }
  console.log('[changelog] Wrote src/config/changelog.json and package.json.');
}

// Only run when executed directly, so tests can import the helpers.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(`[changelog] ${err.message ?? err}`);
    process.exit(1);
  });
}
