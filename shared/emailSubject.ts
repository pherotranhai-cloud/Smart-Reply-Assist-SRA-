/**
 * Splits a composed email into its subject line and body.
 *
 * The /compose prompt asks for a first line "Subject: …" (shared/compose.ts),
 * but models sometimes bold it ("**Subject:** …") or translate the keyword
 * ("Chủ đề: …", "主旨：…"). Matching only a plain "subject:" prefix used to
 * leave those subjects inside the body, so the subject field stayed empty.
 */
const SUBJECT_LINE =
  /^\s*(?:\*\*|__)?\s*(?:subject|re|chủ đề|tiêu đề|主题|主旨|主題|標題|标题|subjek|perihal)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*?)\s*(?:\*\*|__)?\s*$/i;

export function splitEmailSubject(text: string): { subject: string; body: string } {
  const lines = text.split('\n');
  const first = lines.findIndex((line) => line.trim() !== '');
  if (first === -1) return { subject: '', body: text };
  const match = lines[first].match(SUBJECT_LINE);
  if (!match || !match[1]) return { subject: '', body: text };
  return { subject: match[1].trim(), body: lines.slice(first + 1).join('\n').trim() };
}
