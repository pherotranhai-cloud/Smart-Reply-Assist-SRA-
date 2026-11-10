#!/usr/bin/env node
/**
 * PWA test-suite runner (Playwright, Chromium).
 *
 * Usage:
 *   node run_suite.js --suite pwa-test-run/suite.js --base-url http://localhost:8080 --out pwa-test-run
 *        [--feature add-task] [--only-failed pwa-test-run/results.json]
 *        [--workers 4] [--timeout 30000] [--headed]
 *
 * The suite file is a CommonJS module; see references/suite-format.md.
 * Every execution (each repeat counts as one) runs in a fresh browser context.
 * Output: <out>/results.json and <out>/screenshots/*.png for failures.
 */
const fs = require('fs');
const path = require('path');

let playwright;
try {
  playwright = require('playwright');
} catch (e) {
  try {
    playwright = require(require.resolve('playwright', { paths: [process.cwd()] }));
  } catch (e2) {
    console.error('Playwright not found. Install: npm i -D playwright && npx playwright install chromium');
    process.exit(2);
  }
}

// ---------- args ----------
function parseArgs(argv) {
  const a = { workers: 4, timeout: 30000, headed: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === '--suite') a.suite = next();
    else if (k === '--base-url') a.baseURL = next();
    else if (k === '--out') a.out = next();
    else if (k === '--feature') a.feature = next();
    else if (k === '--only-failed') a.onlyFailed = next();
    else if (k === '--workers') a.workers = parseInt(next(), 10);
    else if (k === '--timeout') a.timeout = parseInt(next(), 10);
    else if (k === '--headed') a.headed = true;
    else { console.error('Unknown arg ' + k); process.exit(2); }
  }
  if (!a.suite || !a.baseURL) {
    console.error('Required: --suite <file> --base-url <url>');
    process.exit(2);
  }
  a.out = a.out || path.dirname(path.resolve(a.suite));
  return a;
}

// ---------- assertions ----------
class AssertionError extends Error {
  constructor(msg) { super(msg); this.name = 'AssertionError'; }
}
function assert(cond, msg) { if (!cond) throw new AssertionError(msg || 'assertion failed'); }
assert.equal = (actual, expected, msg) => {
  if (actual !== expected)
    throw new AssertionError(`${msg || 'not equal'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};
assert.notEqual = (actual, expected, msg) => {
  if (actual === expected) throw new AssertionError(`${msg || 'should differ'}: both ${JSON.stringify(actual)}`);
};
assert.includes = (hay, needle, msg) => {
  if (!String(hay).includes(needle))
    throw new AssertionError(`${msg || 'missing text'}: ${JSON.stringify(needle)} not in ${JSON.stringify(String(hay).slice(0, 200))}`);
};
assert.notIncludes = (hay, needle, msg) => {
  if (String(hay).includes(needle))
    throw new AssertionError(`${msg || 'unexpected text'}: ${JSON.stringify(needle)} found`);
};
assert.count = async (locator, n, msg) => {
  const c = await locator.count();
  if (c !== n) throw new AssertionError(`${msg || 'count mismatch'}: expected ${n}, got ${c}`);
};
assert.visible = async (locator, msg) => {
  if (!(await locator.first().isVisible().catch(() => false)))
    throw new AssertionError(msg || 'element not visible');
};

// ---------- helpers given to tests ----------
async function waitForServiceWorker(page, timeoutMs = 10000) {
  return page.evaluate(async (t) => {
    if (!('serviceWorker' in navigator)) return { supported: false, controlled: false };
    const timeout = new Promise((r) => setTimeout(() => r('timeout'), t));
    const ready = await Promise.race([navigator.serviceWorker.ready, timeout]);
    if (ready === 'timeout') return { supported: true, registered: false, controlled: false };
    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })),
        new Promise((r) => setTimeout(r, Math.min(t, 5000))),
      ]);
    }
    return { supported: true, registered: true, controlled: !!navigator.serviceWorker.controller };
  }, timeoutMs);
}

async function goOfflineAndReload(page, context) {
  // Clear the browser HTTP cache so only the service worker can serve files offline.
  try { const cdp = await context.newCDPSession(page); await cdp.send('Network.clearBrowserCache'); } catch (_) {}
  await context.setOffline(true);
  let ok = true, error = null;
  try {
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch (e) { ok = false; error = e.message; }
  return { ok, error };
}

// ---------- expand suite ----------
function expand(suite, args) {
  let onlyIds = null;
  if (args.onlyFailed) {
    const prev = JSON.parse(fs.readFileSync(args.onlyFailed, 'utf8'));
    onlyIds = new Set(prev.executions.filter((e) => e.status !== 'passed').map((e) => `${e.feature}::${e.caseId}`));
  }
  const jobs = [];
  for (const f of suite.features || []) {
    if (args.feature && f.id !== args.feature) continue;
    for (const c of f.cases || []) {
      if (onlyIds && !onlyIds.has(`${f.id}::${c.id}`)) continue;
      const n = Math.max(1, c.repeat || 1);
      for (let i = 1; i <= n; i++) {
        jobs.push({ feature: f, kase: c, iteration: i, of: n });
      }
    }
  }
  return jobs;
}

function withTimeout(p, ms, label) {
  let t;
  return Promise.race([
    p,
    new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`Timeout after ${ms}ms (${label})`)), ms); }),
  ]).finally(() => clearTimeout(t));
}

async function runJob(browser, job, args, suite, shotsDir) {
  const { feature, kase, iteration, of } = job;
  const ctxOpts = Object.assign({}, suite.contextDefaults || {}, feature.context || {}, kase.context || {});
  const offlineAtStart = !!ctxOpts.offline;
  delete ctxOpts.offline;
  const context = await browser.newContext(Object.assign({ baseURL: args.baseURL }, ctxOpts));
  if (offlineAtStart) await context.setOffline(true);
  const page = await context.newPage();

  const pageErrors = [], consoleErrors = [], failedRequests = [], logs = [];
  page.on('pageerror', (e) => pageErrors.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('requestfailed', (r) => failedRequests.push(`${r.method()} ${r.url()} :: ${r.failure() && r.failure().errorText}`));
  page.on('response', (r) => { if (r.status() >= 400) failedRequests.push(`${r.request().method()} ${r.url()} :: HTTP ${r.status()}`); });

  const t0 = Date.now();
  let status = 'passed', error = null, screenshot = null;
  const timeout = kase.timeout || feature.timeout || args.timeout;
  try {
    await withTimeout(
      kase.run({
        page, context, browser, baseURL: args.baseURL, assert,
        iteration, log: (s) => logs.push(String(s)),
        waitForServiceWorker: (ms) => waitForServiceWorker(page, ms),
        goOfflineAndReload: () => goOfflineAndReload(page, context),
      }),
      timeout, kase.id
    );
    const strict = kase.failOnPageError ?? feature.failOnPageError ?? suite.failOnPageError ?? true;
    if (strict && pageErrors.length) {
      status = 'failed';
      error = 'Uncaught page error: ' + pageErrors[0];
    }
  } catch (e) {
    status = e instanceof AssertionError ? 'failed' : 'error';
    error = (e && e.message ? e.message : String(e)).replace(/\u001b\[[0-9;]*m/g, '')
      .split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' | ');
  }
  if (status !== 'passed') {
    const name = `${feature.id}__${kase.id}__${iteration}.png`.replace(/[^\w.-]+/g, '_');
    try { await page.screenshot({ path: path.join(shotsDir, name), fullPage: true }); screenshot = path.join('screenshots', name); } catch (_) {}
  }
  const rec = {
    feature: feature.id, featureName: feature.name || feature.id,
    caseId: kase.id, title: kase.title || kase.id,
    kind: of > 1 ? 'repeat' : 'scenario', category: kase.category || null,
    iteration, of, status, durationMs: Date.now() - t0, error,
    pageErrors, consoleErrors: consoleErrors.slice(0, 10), failedRequests: failedRequests.slice(0, 10),
    logs, screenshot,
  };
  await context.close().catch(() => {});
  return rec;
}

async function main() {
  const args = parseArgs(process.argv);
  const suitePath = path.resolve(args.suite);
  const suite = require(suitePath);
  fs.mkdirSync(args.out, { recursive: true });
  const shotsDir = path.join(args.out, 'screenshots');
  fs.mkdirSync(shotsDir, { recursive: true });

  const jobs = expand(suite, args);
  if (!jobs.length) { console.error('No test executions selected.'); process.exit(1); }
  console.log(`Running ${jobs.length} executions with ${args.workers} worker(s) against ${args.baseURL}`);

  const browser = await playwright.chromium.launch({ headless: !args.headed });
  const startedAt = new Date().toISOString();
  const results = new Array(jobs.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < jobs.length) {
      const idx = next++;
      results[idx] = await runJob(browser, jobs[idx], args, suite, shotsDir);
      done++;
      const r = results[idx];
      if (r.status !== 'passed') console.log(`  ✗ ${r.feature}/${r.caseId}#${r.iteration}: ${r.error}`);
      if (done % 25 === 0) console.log(`  ... ${done}/${jobs.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, args.workers) }, worker));
  await browser.close();

  let executions = results;
  const outFile = path.join(args.out, 'results.json');
  if (args.onlyFailed) {
    // Merge: replace the re-run cases' executions in the previous results, keep the rest.
    const prev = JSON.parse(fs.readFileSync(args.onlyFailed, 'utf8'));
    fs.writeFileSync(path.join(args.out, 'results.prev.json'), JSON.stringify(prev, null, 2));
    const rerunKeys = new Set(results.map((r) => `${r.feature}::${r.caseId}`));
    executions = prev.executions.filter((e) => !rerunKeys.has(`${e.feature}::${e.caseId}`)).concat(results);
  }
  const out = {
    meta: {
      baseURL: args.baseURL, suite: suitePath, startedAt, finishedAt: new Date().toISOString(),
      browser: 'chromium', rerunOf: args.onlyFailed || null, feature: args.feature || null,
    },
    executions,
  };
  fs.writeFileSync(outFile, JSON.stringify(out, null, 2));
  const pass = results.filter((r) => r.status === 'passed').length;
  console.log(`Done: ${pass}/${results.length} passed in this run → ${outFile}` +
    (args.onlyFailed ? ' (merged with previous results; old copy in results.prev.json)' : ''));
}

main().catch((e) => { console.error(e); process.exit(1); });
