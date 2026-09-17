import { CopyFormat } from '../types';

/**
 * The model answers in Markdown and the app renders it with react-markdown, so
 * `**text**` shows on screen as real bold. The copy buttons, however, used to
 * hand the raw Markdown to the clipboard: pasted into Zalo, WeChat, Messenger
 * or any other box that does not parse Markdown, the asterisks show up as
 * literal characters around the words that were meant to stand out.
 *
 * This module converts that Markdown into what the destination can actually
 * display. Nothing here re-implements a full Markdown parser — it covers what
 * the model writes into a chat reply (emphasis, headings, lists, links, code)
 * and leaves anything it does not recognise as plain text.
 */

/** One run of text sharing the same inline styles. */
interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
}

/** A source line, split into its literal prefix (list marker) and its spans. */
interface Line {
  prefix: string;
  spans: Span[];
}

type Style = Omit<Span, 'text'>;

/** Characters a backslash may escape in Markdown. */
const ESCAPABLE = /[\\`*_~[\]()#+\-.!>]/;

/** Letters and digits, any script — used to keep `snake_case` out of italics. */
const WORD_CHAR = /[\p{L}\p{N}]/u;

/**
 * Unicode Mathematical Sans-Serif Bold, the only "bold" that survives a paste
 * into an app with no formatting of its own. It covers A-Z, a-z and 0-9 and
 * nothing else: there is no bold `ê`, `ơ` or `中` in Unicode. A span holding
 * one of those cannot be converted at all, which is why this returns null
 * rather than a half-converted string — see toUnicodeBold's callers.
 */
const BOLD_UPPER = 0x1d5d4;
const BOLD_LOWER = 0x1d5ee;
const BOLD_DIGIT = 0x1d7ec;

function toUnicodeBold(text: string): string | null {
  let out = '';
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code >= 0x41 && code <= 0x5a) out += String.fromCodePoint(BOLD_UPPER + code - 0x41);
    else if (code >= 0x61 && code <= 0x7a) out += String.fromCodePoint(BOLD_LOWER + code - 0x61);
    else if (code >= 0x30 && code <= 0x39) out += String.fromCodePoint(BOLD_DIGIT + code - 0x30);
    // ASCII space and punctuation have no bold form and need none.
    else if (code < 0x80) out += ch;
    // Vietnamese diacritics, CJK, emoji: no bold glyph exists for this span.
    else return null;
  }
  return out;
}

/** Whether `ch` at `i` starts a run, and how long that run is. */
function runLength(src: string, i: number, ch: string): number {
  let n = 0;
  while (src[i + n] === ch) n++;
  return n;
}

interface EmphasisMatch {
  inner: string;
  end: number;
  style: Style;
}

/**
 * Matches `**bold**`, `*italic*`, `_italic_` and `~~strike~~` starting at
 * `start`, following the two CommonMark rules that matter in practice: the
 * opener may not be followed by a space, the closer may not be preceded by one.
 * `_` additionally may not sit against a word character, so `snake_case_names`
 * and `file_name_2` survive untouched.
 *
 * The closing run is consumed from its end, so `***text***` closes the outer
 * `**` on the last two asterisks and leaves `*text*` for the recursive call.
 */
function matchEmphasis(src: string, start: number): EmphasisMatch | null {
  const ch = src[start];
  const run = runLength(src, start, ch);
  const marks = ch === '~' ? 2 : Math.min(run, 2);
  if (ch === '~' && run < 2) return null;

  const openEnd = start + marks;
  if (openEnd >= src.length) return null;
  if (/\s/.test(src[openEnd])) return null;
  if (ch === '_' && start > 0 && WORD_CHAR.test(src[start - 1])) return null;

  let j = openEnd;
  while (j < src.length) {
    if (src[j] === '\\') {
      j += 2;
      continue;
    }
    if (src[j] !== ch) {
      j++;
      continue;
    }
    const closeRun = runLength(src, j, ch);
    if (closeRun < marks) {
      j += closeRun;
      continue;
    }
    const end = j + closeRun;
    const inner = src.slice(openEnd, end - marks);
    const after = src[end];
    const usable =
      inner.length > 0 &&
      !/\s$/.test(inner) &&
      !(ch === '_' && after !== undefined && WORD_CHAR.test(after));
    if (!usable) {
      j += closeRun;
      continue;
    }
    const style: Style =
      ch === '~' ? { strike: true } : marks === 2 ? { bold: true } : { italic: true };
    return { inner, end, style };
  }
  return null;
}

interface LinkMatch {
  label: string;
  url: string;
  end: number;
  image: boolean;
}

/** Matches `[label](url)` and `![alt](url)` starting at `start`. */
function matchLink(src: string, start: number): LinkMatch | null {
  const image = src[start] === '!';
  const open = image ? start + 1 : start;
  if (src[open] !== '[') return null;

  let depth = 0;
  let i = open;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') {
      i++;
      continue;
    }
    if (c === '[') depth++;
    else if (c === ']') {
      depth--;
      if (depth === 0) break;
    }
  }
  if (depth !== 0 || src[i + 1] !== '(') return null;

  const close = src.indexOf(')', i + 2);
  if (close === -1) return null;

  // `(url "title")` — the title is dropped, only the target is kept.
  const target = src.slice(i + 2, close).trim().split(/\s+/)[0] ?? '';
  return {
    label: src.slice(open + 1, i),
    url: target.replace(/^<|>$/g, ''),
    end: close + 1,
    image
  };
}

/** Splits one line of Markdown into styled spans. */
function parseInline(src: string, style: Style = {}): Span[] {
  const spans: Span[] = [];
  let plain = '';
  const flush = () => {
    if (plain) {
      spans.push({ text: plain, ...style });
      plain = '';
    }
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i];

    if (ch === '\\' && i + 1 < src.length && ESCAPABLE.test(src[i + 1])) {
      plain += src[i + 1];
      i += 2;
      continue;
    }

    if (ch === '`') {
      const run = runLength(src, i, '`');
      const close = src.indexOf('`'.repeat(run), i + run);
      if (close !== -1) {
        flush();
        spans.push({ text: src.slice(i + run, close), ...style, code: true });
        i = close + run;
        continue;
      }
    }

    if (ch === '*' || ch === '_' || (ch === '~' && src[i + 1] === '~')) {
      const emphasis = matchEmphasis(src, i);
      if (emphasis) {
        flush();
        spans.push(...parseInline(emphasis.inner, { ...style, ...emphasis.style }));
        i = emphasis.end;
        continue;
      }
    }

    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      const link = matchLink(src, i);
      if (link) {
        flush();
        if (link.image) {
          // An image cannot be pasted into a chat box; its alt text is all the
          // information the reader can still use.
          if (link.label) spans.push({ text: link.label, ...style });
        } else {
          spans.push(...parseInline(link.label, style));
          // The label alone would lose the destination, so the URL follows it —
          // unless the label already is the URL, as autolinks are written.
          if (link.url && link.url !== link.label) plain += ` (${link.url})`;
        }
        i = link.end;
        continue;
      }
    }

    plain += ch;
    i++;
  }

  flush();
  return spans;
}

/** Thematic break: `---`, `***`, `___` and their spaced variants. */
const RULE = /^\s{0,3}([-*_])[ \t]*(\1[ \t]*){2,}$/;

/**
 * Splits a Markdown document into lines carrying a literal prefix and spans.
 * Fenced code blocks pass through verbatim — the fence lines themselves are
 * dropped, since a chat box has nothing to do with them.
 */
function parseBlocks(md: string): Line[] {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const out: Line[] = [];
  let fence: string | null = null;

  for (const raw of lines) {
    const fenceMatch = raw.match(/^\s{0,3}(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) {
        fence = marker;
        continue;
      }
      if (marker === fence) {
        fence = null;
        continue;
      }
    }
    if (fence !== null) {
      out.push({ prefix: '', spans: [{ text: raw, code: true }] });
      continue;
    }

    if (RULE.test(raw)) {
      out.push({ prefix: '', spans: [] });
      continue;
    }

    // Quote markers carry no meaning once the formatting is gone; nested ones
    // ('> > ') collapse in a single pass.
    let line = raw.replace(/^(\s{0,3})(?:>\s?)+/, '$1');

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/);
    // A heading is emphasis in a chat message, so its text is carried as bold
    // rather than dropped along with the hashes.
    if (heading) line = heading[2];

    let prefix = '';
    const bullet = line.match(/^(\s*)[-*+][ \t]+(.*)$/);
    const ordered = line.match(/^(\s*)(\d{1,9})[.)][ \t]+(.*)$/);
    if (bullet) {
      prefix = `${bullet[1]}• `;
      line = bullet[2];
    } else if (ordered) {
      prefix = `${ordered[1]}${ordered[2]}. `;
      line = ordered[3];
    }

    if (prefix) {
      const task = line.match(/^\[([ xX])\][ \t]+(.*)$/);
      if (task) {
        prefix += task[1] === ' ' ? '☐ ' : '☑ ';
        line = task[2];
      }
    }

    out.push({ prefix, spans: parseInline(line, heading ? { bold: true } : {}) });
  }

  return out;
}

function renderSpan(span: Span, format: CopyFormat): string {
  if (!span.bold) return span.text;
  if (format === 'unicode') {
    // A span the bold alphabet cannot express (Vietnamese diacritics, Chinese,
    // emoji) is left as it is: half-converted words read worse than plain ones.
    return toUnicodeBold(span.text) ?? span.text;
  }
  if (format === 'uppercase') return span.text.toLocaleUpperCase();
  return span.text;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function spansToHtml(spans: Span[]): string {
  return spans
    .map((span) => {
      let html = escapeHtml(span.text);
      if (span.code) html = `<code>${html}</code>`;
      if (span.strike) html = `<s>${html}</s>`;
      if (span.italic) html = `<em>${html}</em>`;
      if (span.bold) html = `<strong>${html}</strong>`;
      return html;
    })
    .join('');
}

/**
 * The same lines as the plain flavour, as HTML. One <div> per line rather than
 * <br>-joined text: Word, Gmail and Outlook all keep line structure that way,
 * and pre-wrap preserves the indentation of nested list items.
 */
function linesToHtml(lines: Line[]): string {
  const body = lines
    .map((line) => {
      const html = escapeHtml(line.prefix) + spansToHtml(line.spans);
      return `<div>${html || '<br>'}</div>`;
    })
    .join('');
  return `<div style="white-space:pre-wrap;">${body}</div>`;
}

/** What a copy puts on the clipboard: always text, HTML only where it helps. */
export interface CopyPayload {
  text: string;
  html?: string;
}

/**
 * Renders `source` for the clipboard under the chosen format.
 *
 * The HTML flavour rides along with 'plain' only. An app that understands rich
 * text (Word, Gmail, Notion, and the desktop chat clients built on a web view)
 * takes it and shows real bold; everything else falls back to the plain text,
 * which is the same message with the markers removed. The other formats are
 * explicit choices about what the *plain* text should look like, so adding a
 * styled flavour next to them would just override the choice in half the apps.
 */
export function formatForCopy(source: string, format: CopyFormat = 'plain'): CopyPayload {
  if (!source) return { text: '' };
  if (format === 'markdown') return { text: source };

  const lines = parseBlocks(source);
  const text = lines
    .map((line) => (line.prefix + line.spans.map((s) => renderSpan(s, format)).join('')).replace(/[ \t]+$/, ''))
    .join('\n');

  return format === 'plain' ? { text, html: linesToHtml(lines) } : { text };
}

/** True when `source` carries markup a copy would otherwise paste literally. */
export function hasMarkdownMarkup(source: string): boolean {
  return formatForCopy(source, 'plain').text !== source;
}
