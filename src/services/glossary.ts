import type { Language, VocabItem } from '../types';

/**
 * The one glossary matcher.
 *
 * Before this module there were two: useTranslateTab.getDetectedGlossaryTerms()
 * matched on `item.term` — a category label ("Component", "Dept name"), never a
 * phrase — to render the "detected terms" chips, while AIService
 * .buildGlossaryPrompt() matched on vi/en/zh_cn/zh_tw to build the payload the
 * model actually receives. The chips therefore described a different set of
 * terms than the ones being injected, and `handleTranslate` then shipped
 * whichever set the client matcher had produced (or, when it produced nothing,
 * the entire 507-row library). Everything that needs to know "which glossary
 * entries does this text hit" now calls matchGlossary() so the two can no
 * longer disagree.
 *
 * `term` is never matched against source text — see shared/vocabNormalize.ts.
 */

/** VocabItem columns that hold a real phrase. Deliberately excludes `term`. */
export type GlossaryTargetKey = 'vi' | 'en' | 'zh_cn' | 'zh_tw' | 'id_lang' | 'my';

export interface GlossaryMatch {
  /** The library row this match came from, so a chip and the prompt entry share one object. */
  item: VocabItem;
  /** The library phrase that matched, as written in the sheet (not as written in the text). */
  source: string;
  /** That row's phrase in the requested language. */
  target: string;
  /** Half-open span in the ORIGINAL text: text.slice(start, end) is what matched. */
  start: number;
  end: number;
}

/**
 * Language -> column. Replaces the two copies that had drifted apart
 * (AIService.buildGlossaryPrompt's if-chain and useTranslateTab's switch).
 *
 * `Record<Lowercase<Language>, ...>` in the type is load-bearing: adding a
 * member to the Language union without giving it a column here is a compile
 * error rather than a silent fall-through to English. The extra keys are the
 * loose codes the backend and the speech layer pass around.
 *
 * 'Auto' maps to null — there is no column to pin to, and pinning English (what
 * the old if-chain did by falling through to its default) told the model to
 * "translate to Auto" using English terminology.
 */
export const TARGET_KEY_BY_LANGUAGE: Record<Lowercase<Language>, GlossaryTargetKey | null> &
  Record<string, GlossaryTargetKey | null> = {
  auto: null,
  vietnamese: 'vi',
  english: 'en',
  'chinese (simplified)': 'zh_cn',
  'chinese (traditional)': 'zh_tw',
  indonesian: 'id_lang',
  burmese: 'my',

  vi: 'vi',
  'vi-vn': 'vi',
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  zh: 'zh_cn',
  chinese: 'zh_cn',
  'zh-cn': 'zh_cn',
  zh_cn: 'zh_cn',
  'zh-hans': 'zh_cn',
  'zh-tw': 'zh_tw',
  zh_tw: 'zh_tw',
  'zh-hant': 'zh_tw',
  id: 'id_lang',
  'id-id': 'id_lang',
  id_lang: 'id_lang',
  my: 'my',
  'my-mm': 'my',
};

/** null means "no glossary for this language" (only 'Auto' today). */
export function glossaryTargetKey(lang: string): GlossaryTargetKey | null {
  const key = String(lang ?? '').trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(TARGET_KEY_BY_LANGUAGE, key)) {
    return TARGET_KEY_BY_LANGUAGE[key];
  }
  // Unreachable for any Language value (the map is exhaustive over the union),
  // so this only catches an unenumerated loose code. English is the library's
  // most complete column and was the old if-chain's default.
  return key.includes('chinese') ? 'zh_cn' : 'en';
}

function readField(item: VocabItem, key: GlossaryTargetKey): string {
  const value = item[key];
  return value === undefined || value === null ? '' : String(value).trim();
}

/** Mirrors shared/vocabNormalize.ts: undefined/null is enabled, only an explicit false/"false" disables. */
function isEnabled(item: VocabItem): boolean {
  const value = item.enabled;
  if (value === undefined || value === null) return true;
  if (value === false) return false;
  return String(value).trim().toLowerCase() !== 'false';
}

/**
 * Every column that can hold a phrase to look for in the source text. id_lang
 * and my are included even though the current sheet leaves them empty: an
 * Indonesian or Burmese message is as plausible an input on this floor as an
 * English one, and the boundary rules below already handle both scripts, so
 * including them costs one indexOf per row today and is correct the day the
 * sheet gains those columns.
 */
const SOURCE_KEYS: GlossaryTargetKey[] = ['vi', 'en', 'zh_cn', 'zh_tw', 'id_lang', 'my'];

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const WORD_CHAR = /[\p{L}\p{N}]/u;
/**
 * Scripts written without spaces between words. A phrase in one of these has no
 * word boundary to anchor to, so it is matched as a plain substring — which is
 * also why the old `\b` was simply wrong for Chinese and Burmese.
 */
const NO_WORD_SEPARATORS = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Myanmar}\p{sc=Thai}\p{sc=Khmer}\p{sc=Lao}]/u;

/** A letter/digit in a script that does separate words, i.e. something a boundary must not sit inside. */
function isSeparatedWordChar(ch: string | undefined): boolean {
  return !!ch && WORD_CHAR.test(ch) && !NO_WORD_SEPARATORS.test(ch);
}

interface FoldedText {
  folded: string;
  /**
   * foldedIndex -> index in the original string of the character that produced
   * it, with one extra entry at the end holding the original length.
   */
  map: number[];
}

/** Case- and diacritic-folds one character; it may yield more or fewer than one. */
function foldChar(ch: string): string {
  let piece = ch.normalize('NFD').replace(COMBINING_MARKS, '');
  if (piece === 'đ') piece = 'd';
  else if (piece === 'Đ') piece = 'D';
  return piece.toLowerCase();
}

/**
 * Case- and diacritic-folds `text` while recording where every folded character
 * came from, so a match found in the folded string can be reported as a span in
 * the ORIGINAL string.
 *
 * Why an index map rather than folding in place: NFD + stripping U+0300-U+036F
 * is *not* length-preserving (precomposed "ế" decomposes to three code units
 * before the two marks are dropped), and toLowerCase can expand a character
 * too, so folded offsets drift from original offsets as soon as the text has
 * any accents — which, for Vietnamese, is always. Folding one original
 * character at a time and pushing its original index once per character it
 * produces makes the mapping exact by construction, whatever the fold does to
 * lengths. đ/Đ are handled here rather than by NFD because they do not
 * decompose.
 *
 * A combining mark standing alone (already-decomposed input) folds to nothing
 * and contributes no entry, which is what makes a match ending just before one
 * still include it: the next entry's original index is past the mark.
 */
function foldWithIndexMap(text: string): FoldedText {
  let folded = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const piece = foldChar(text[i]);
    for (let k = 0; k < piece.length; k++) {
      folded += piece[k];
      map.push(i);
    }
  }
  map.push(text.length);
  return { folded, map };
}

/**
 * Library phrases get folded without an index map (only the text's offsets are
 * ever reported) and are cached: matchGlossary runs on every keystroke, and
 * re-folding ~1500 phrases character by character each time is most of its
 * cost. The phrases are a closed set — one vocabulary library — so the cache
 * fills once and then hits; it is cleared wholesale rather than evicted per
 * entry because an LRU would cost more bookkeeping than the refold it saves.
 */
const foldedPhraseCache = new Map<string, string>();
const MAX_FOLDED_PHRASE_CACHE = 8192;

function foldPhrase(phrase: string): string {
  const cached = foldedPhraseCache.get(phrase);
  if (cached !== undefined) return cached;
  let folded = '';
  for (let i = 0; i < phrase.length; i++) folded += foldChar(phrase[i]);
  if (foldedPhraseCache.size >= MAX_FOLDED_PHRASE_CACHE) foldedPhraseCache.clear();
  foldedPhraseCache.set(phrase, folded);
  return folded;
}

/**
 * Caps. 40 entries is already several hundred tokens of glossary; past that the
 * model starts treating the block as background noise, and a single chat
 * message realistically contains a handful of factory terms, not forty. The
 * character cap is the real guard — it is what stops a pathological paste from
 * serialising a large slice of a 500-row library into every request — and 4000
 * characters is roughly a thousand tokens, a bounded fraction of the prompt.
 *
 * Both caps are enforced inside matchGlossary rather than in serializeGlossary,
 * so the chips render exactly the entries the model was given. Trimming in the
 * serializer would quietly recreate the divergence this module exists to remove.
 */
export const MAX_GLOSSARY_MATCHES = 40;
export const MAX_GLOSSARY_CHARS = 4000;

/**
 * One phrase repeated many times in the input is still one glossary entry after
 * dedup; the extra occurrences only matter so that a longer term covering one
 * of them cannot leave the others unmatched. A handful is plenty, and the cap
 * keeps a long paste from producing a quadratic overlap walk.
 */
const MAX_OCCURRENCES_PER_SOURCE = 16;

function serializedEntryLength(source: string, target: string): number {
  return JSON.stringify({ term: source, translation: target }).length;
}

function overlaps(a: GlossaryMatch, b: GlossaryMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Finds every glossary row whose phrase actually occurs in `text`, as spans of
 * `text`.
 *
 * No RegExp is ever built from library data: occurrences are found with indexOf
 * on the folded strings and the word boundaries are decided by looking at the
 * characters next to the match. That removes the escaping hazard at the source
 * rather than papering over it — the old code interpolated raw terms into
 * `new RegExp('\\b' + term + '\\b')`, so a row like "C+ (A.1)" either threw
 * (silently falling back to a boundary-less `includes`) or matched something
 * else entirely.
 */
export function matchGlossary(text: string, vocab: VocabItem[], targetLang: string): GlossaryMatch[] {
  const targetKey = glossaryTargetKey(targetLang);
  // 'Auto' has no target column, so there is no translation to pin a term to.
  // The old code fell through to English and pinned English terms into a prompt
  // that reads "Translate to Auto" — two wrong answers rather than none.
  if (!targetKey) return [];
  if (!text || !text.trim()) return [];
  if (!vocab || vocab.length === 0) return [];

  const { folded, map } = foldWithIndexMap(text);
  if (!folded) return [];

  const candidates: GlossaryMatch[] = [];

  for (const item of vocab) {
    if (!isEnabled(item)) continue;

    const target = readField(item, targetKey);
    if (!target) continue; // Nothing to pin this row to in the requested language.

    for (const key of SOURCE_KEYS) {
      const source = readField(item, key);
      // A blank or punctuation-only cell would otherwise match everywhere.
      if (!source || !WORD_CHAR.test(source)) continue;
      // Keeps the old guard's intent: "X -> X" is not an instruction.
      if (source.toLowerCase() === target.toLowerCase()) continue;

      const foldedSource = foldPhrase(source);
      if (!foldedSource) continue;

      const needsLeadingBoundary = isSeparatedWordChar(foldedSource[0]);
      const needsTrailingBoundary = isSeparatedWordChar(foldedSource[foldedSource.length - 1]);

      let found = 0;
      let from = 0;
      while (found < MAX_OCCURRENCES_PER_SOURCE) {
        const at = folded.indexOf(foldedSource, from);
        if (at === -1) break;
        from = at + 1;

        const after = at + foldedSource.length;
        // A term may legitimately start or end on punctuation ("C+ (A.1)"), in
        // which case that edge gets no boundary requirement at all.
        if (needsLeadingBoundary && isSeparatedWordChar(folded[at - 1])) continue;
        if (needsTrailingBoundary && isSeparatedWordChar(folded[after])) continue;

        const start = map[at];
        let end = map[after];
        // The match ended part-way through one original character (a fold that
        // expanded it): take the whole character rather than half of it.
        if (after > 0 && after < folded.length && map[after] === map[after - 1]) end = map[after] + 1;
        if (end <= start) continue;

        candidates.push({ item, source, target, start, end });
        found++;
      }
    }
  }

  if (candidates.length === 0) return [];

  // Longest *matched span* first — the old sort ranked rows by
  // max(vi.length, en.length, zh_cn.length), i.e. by a string that had nothing
  // to do with what matched. Ties are broken deterministically so the same
  // input always produces the same glossary.
  candidates.sort((a, b) => {
    const lengthDelta = (b.end - b.start) - (a.end - a.start);
    if (lengthDelta !== 0) return lengthDelta;
    if (a.start !== b.start) return a.start - b.start;
    const sourceDelta = a.source.localeCompare(b.source);
    if (sourceDelta !== 0) return sourceDelta;
    const targetDelta = a.target.localeCompare(b.target);
    if (targetDelta !== 0) return targetDelta;
    return a.item.id.localeCompare(b.item.id);
  });

  const kept: GlossaryMatch[] = [];
  const claimed: GlossaryMatch[] = [];
  const seenPairs = new Set<string>();
  let serializedLength = 2; // the enclosing [].

  for (const candidate of candidates) {
    if (kept.length >= MAX_GLOSSARY_MATCHES) break;
    // Overlap suppression: "quality control" wins the span outright, so
    // "quality" cannot also be injected for it and contradict the instruction.
    if (claimed.some(existing => overlaps(existing, candidate))) continue;
    // Claimed even if the entry itself is dropped below, so a shorter term can
    // never sneak into a span a longer one already owns.
    claimed.push(candidate);

    const pair = candidate.source.toLowerCase() + '\u0000' + candidate.target.toLowerCase();
    if (seenPairs.has(pair)) continue;

    const entryLength = serializedEntryLength(candidate.source, candidate.target) + (kept.length > 0 ? 1 : 0);
    if (serializedLength + entryLength > MAX_GLOSSARY_CHARS) continue;

    seenPairs.add(pair);
    serializedLength += entryLength;
    kept.push(candidate);
  }

  // Reading order, so chips and the prompt list terms the way the text does.
  return kept.sort((a, b) => a.start - b.start || a.end - b.end);
}

/**
 * The wire payload: a JSON array of {term, translation}, which is what
 * /api/translate and /api/compose already wrap in their own XML tags. An empty
 * string (not "[]") for no matches, matching what the backend's
 * `glossary || '[]'` fallback expects.
 *
 * A pure projection — matchGlossary already enforced MAX_GLOSSARY_CHARS.
 */
export function serializeGlossary(matches: GlossaryMatch[]): string {
  if (matches.length === 0) return '';
  return JSON.stringify(matches.map(match => ({ term: match.source, translation: match.target })));
}

/** The single Language -> column read, shared by the glossary chips and anything else that displays a row. */
export function getVocabTranslation(item: VocabItem, lang: string): string {
  const key = glossaryTargetKey(lang);
  // 'Auto' has no column; show whatever the row has so a chip is never blank.
  if (!key) return readField(item, 'vi') || readField(item, 'en');
  return readField(item, key);
}
