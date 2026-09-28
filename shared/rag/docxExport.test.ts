import { describe, expect, it } from 'vitest';
import { parseInlineRuns } from './docxExport';

/** Pulls the run's own text back out of docx's internal XML-builder tree, and whether it carries a bold (w:b) property. */
function inspect(run: ReturnType<typeof parseInlineRuns>[number]): { text: string; bold: boolean } {
  const json = JSON.parse(JSON.stringify(run));
  const textNode = json.root.find((n: any) => n.rootKey === 'w:t');
  const text = textNode.root.find((n: any) => typeof n === 'string') ?? '';
  const rPr = json.root.find((n: any) => n.rootKey === 'w:rPr');
  const bold = !!rPr?.root?.some((n: any) => n.rootKey === 'w:b');
  return { text, bold };
}

describe('parseInlineRuns', () => {
  it('returns a single plain run for text with no bold markers', () => {
    const runs = parseInlineRuns('plain text').map(inspect);
    expect(runs).toEqual([{ text: 'plain text', bold: false }]);
  });

  it('splits **bold** spans into alternating plain/bold runs', () => {
    const runs = parseInlineRuns('foo **bar** baz').map(inspect);
    expect(runs).toEqual([
      { text: 'foo ', bold: false },
      { text: 'bar', bold: true },
      { text: ' baz', bold: false },
    ]);
  });

  it('handles a line that starts with a bold label, e.g. "**Cause:** text"', () => {
    const runs = parseInlineRuns('**Cause:** supervisors bypassed inspection').map(inspect);
    expect(runs[0]).toEqual({ text: 'Cause:', bold: true });
    expect(runs[1].bold).toBe(false);
    expect(runs[1].text).toContain('supervisors bypassed inspection');
  });

  it('handles multiple bold spans on one line', () => {
    const runs = parseInlineRuns('**A** and **B**').map(inspect);
    expect(runs.map((r) => r.text)).toEqual(['A', ' and ', 'B']);
    expect(runs.map((r) => r.bold)).toEqual([true, false, true]);
  });
});
