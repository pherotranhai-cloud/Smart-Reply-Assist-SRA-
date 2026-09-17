import type { VocabItem } from '../src/types';

/**
 * The vocab data pipeline, shared by both /import-vocab implementations
 * (netlify/functions/api.ts's Express route and the standalone
 * netlify/functions/import-vocab.ts handler) and by storage.getVocab()'s
 * healing pass in src/services/storage.ts.
 *
 * Before this module existed the two importers each re-implemented the
 * CSV-row -> VocabItem mapping and disagreed on the output shape: api.ts's
 * route returned {meaning_vi, target_en, target_zh_cn, target_zh_tw, ...}
 * while VocabItem — and every component that reads vocab — expects
 * {vi, en, zh_cn, zh_tw, ...}. On localhost and on Render (anywhere that
 * wasn't netlify.app, which used the other importer) that mismatch is why
 * the glossary rendered empty. One extraction path, one shape, everywhere.
 *
 * No Node built-ins in this file on purpose: it's imported by
 * src/services/storage.ts, which ships in the browser bundle. The md5 id for
 * a freshly-imported row is still computed with Node's `crypto`, but that
 * import stays local to the two server-side callers, which already have it.
 *
 * `term` is a category label in the current library ("Component", "Dept
 * name"), not a phrase to translate — keep it for display, but a matching
 * algorithm should only ever look at vi/en/zh_cn/zh_tw/id_lang/my.
 */

function str(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

/** undefined/null means enabled; only an explicit false/"false" (any case) disables. */
function parseEnabled(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (value === false) return false;
  return String(value).trim().toLowerCase() !== 'false';
}

/**
 * Normalizes a CSV header the way both importers used to do it separately —
 * lowercase, non-alphanumerics collapse to a single underscore, edges
 * trimmed. Kept from api.ts's version since it's the more forgiving of the
 * two: "Meaning (VI)", "meaning-vi" and "meaning_vi" all land on the same
 * "meaning_vi" key, where import-vocab.ts's old `toLowerCase().replace(/-/g,
 * '_')` left "Meaning (VI)" as "meaning (vi)" and matched nothing.
 */
export function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

interface ExtractOptions {
  /**
   * Whether a bare "id" key should be read as the Indonesian column. True for
   * a freshly parsed CSV row, where a bare "ID" header is the only possible
   * source of that key. False when healing an already-stored VocabItem,
   * where `id` is always the record's own hash and must never leak into
   * id_lang just because the sheet has no Indonesian translation for a row.
   */
  bareIdIsIndonesian: boolean;
}

type VocabFields = Omit<VocabItem, 'id'>;

function extractFields(item: Record<string, any>, opts: ExtractOptions): VocabFields {
  const vi = str(item.vi || item.meaning_vi || item.vietnamese || item.tieng_viet);
  // A row with no term/category column still needs a label VocabManager can
  // display — falls back to the VI phrase, matching the prior api.ts route.
  const term = str(item.term || item.category) || vi;
  const en = str(item.en || item.target_en || item.english || item.tieng_anh);

  // A single "Target ZH" (or bare "zh") column has no CN/TW split in the
  // source sheet, so it seeds both unless a more specific column overrides it.
  const legacyZh = str(item.zh || item.target_zh || item.chinese || item.tieng_trung);
  const zh_cn = str(item.zh_cn || item.target_zh_cn || item.chinese_simplified) || legacyZh;
  const zh_tw = str(item.zh_tw || item.target_zh_tw || item.chinese_traditional) || legacyZh;

  const id_lang = str(
    item.id_lang || item.target_id || item.indonesian || item.tieng_indo ||
    (opts.bareIdIsIndonesian ? item.id : undefined)
  );
  const my = str(item.my || item.target_my || item.burmese || item.tieng_myanmar);

  return {
    term,
    vi,
    en,
    zh_cn,
    zh_tw,
    id_lang,
    my,
    enabled: parseEnabled(item.enable ?? item.enabled)
  };
}

/**
 * Turns one header-normalized CSV row into VocabItem's fields (everything but
 * `id` — the caller owns hashing that, see the file header). Accepts both the
 * current sheet's header style (Meaning (VI)/Target EN/Target ZH/Enable, once
 * normalizeHeader has run) and the bare vi/en/zh_cn/zh_tw/id/my style, plus
 * the legacy aliases both prior importers tolerated.
 */
export function extractVocabRow(item: Record<string, any>): VocabFields {
  return extractFields(item, { bareIdIsIndonesian: true });
}

/**
 * Deterministic string to hash into a row's id. Content-based rather than
 * row-index-based, so re-running a sync against an unchanged sheet produces
 * the same ids and cached vocab doesn't churn between syncs.
 */
export function vocabHashKey(fields: VocabFields): string {
  return [fields.term, fields.vi, fields.en, fields.zh_cn, fields.zh_tw, fields.id_lang, fields.my].join('|');
}

/**
 * True if a row has at least one actual phrase to match against. `term`
 * alone (a category label, not a phrase — see file header) does not count,
 * so a row with only a category and no translations is dropped rather than
 * shown as a blank glossary entry.
 */
export function hasSourcePhrase(item: Pick<VocabItem, 'vi' | 'en' | 'zh_cn' | 'zh_tw' | 'id_lang' | 'my'>): boolean {
  return !!(item.vi || item.en || item.zh_cn || item.zh_tw || item.id_lang || item.my);
}

/**
 * Heals one vocab item that may still be sitting in a user's localStorage
 * from before this fix — either the broken api.ts shape
 * ({meaning_vi, target_en, target_zh_cn, target_zh_tw, target_id, target_my})
 * or an already-correct VocabItem (a no-op beyond trimming/enabled parsing).
 * Never throws: a malformed or empty record comes back as an all-empty
 * VocabItem instead of crashing the vocab manager.
 *
 * Existing ids are preserved so healing doesn't itself churn ids; only a
 * record with no id at all (shouldn't happen, but "never throws" extends to
 * this too) gets a fresh one.
 */
export function normalizeVocabItem(raw: unknown): VocabItem {
  const item = raw && typeof raw === 'object' ? (raw as Record<string, any>) : {};
  const fields = extractFields(item, { bareIdIsIndonesian: false });
  const id = str(item.id) || crypto.randomUUID();
  return { id, ...fields };
}
