import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { Report } from './types';

/** Splits `**bold**` markdown spans out of one line into alternating plain/bold TextRuns. Exported for unit testing. */
export function parseInlineRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const boldSpan = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = boldSpan.exec(text)) !== null) {
    if (match.index > lastIndex) runs.push(new TextRun({ text: text.slice(lastIndex, match.index) }));
    runs.push(new TextRun({ text: match[1], bold: true }));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) runs.push(new TextRun({ text: text.slice(lastIndex) }));

  return runs.length > 0 ? runs : [new TextRun({ text })];
}

/** A numbered issue title line ("1. Non-SOP Operations") — bolded even if the model didn't wrap it in `**`, so each issue reads as its own entry rather than a run-on paragraph. */
const NUMBERED_ISSUE_TITLE = /^\d+\.\s+\S/;

function textParagraphs(content: string): Paragraph[] {
  return content
    .split(/\n+/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const trimmed = line.trim();
      if (NUMBERED_ISSUE_TITLE.test(trimmed) && !trimmed.includes('**')) {
        return new Paragraph({
          children: [new TextRun({ text: trimmed, bold: true })],
          spacing: { before: 160, after: 60 },
        });
      }
      return new Paragraph({ children: parseInlineRuns(line), spacing: { after: 120 } });
    });
}

function headerCell(text: string): TableCell {
  return new TableCell({
    children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
  });
}

function sourcesTable(report: Report): Table {
  const rows = [
    new TableRow({
      children: [headerCell('Log ID'), headerCell('Timestamp'), headerCell('Module'), headerCell('Similarity')],
    }),
    ...report.sources.map(
      (s) =>
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph(String(s.logId))] }),
            new TableCell({ children: [new Paragraph(s.timestamp ?? 'n/a')] }),
            new TableCell({ children: [new Paragraph(s.module ?? 'n/a')] }),
            new TableCell({ children: [new Paragraph(s.similarity.toFixed(3))] }),
          ],
        })
    ),
  ];

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

/**
 * Renders a generated Report as a downloadable .docx buffer. Kept separate
 * from reportGenerator.ts so exporting an already-generated report never
 * re-runs retrieval or calls the LLM again.
 */
export async function reportToDocxBuffer(report: Report): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: report.title, heading: HeadingLevel.TITLE }),
    new Paragraph({
      children: [
        new TextRun({ text: `Generated: ${report.generatedAt}`, italics: true }),
        new TextRun({ text: `    Confidence: ${report.confidence}`, italics: true }),
      ],
      spacing: { after: 200 },
    }),
    new Paragraph({ text: 'Summary', heading: HeadingLevel.HEADING_1 }),
    ...textParagraphs(report.summary),
  ];

  for (const section of report.sections) {
    children.push(new Paragraph({ text: section.heading, heading: HeadingLevel.HEADING_1 }));
    children.push(...textParagraphs(section.content));
  }

  if (report.stats.length > 0) {
    children.push(new Paragraph({ text: 'Log Statistics', heading: HeadingLevel.HEADING_1 }));
    children.push(
      ...report.stats.map(
        (s) =>
          new Paragraph({
            text: `${s.module ?? 'n/a'} — severity: ${s.severity ?? 'n/a'}, issue type: ${s.issueType ?? 'n/a'} — ${s.logCount} log(s)`,
            spacing: { after: 60 },
          })
      )
    );
  }

  if (report.sources.length > 0) {
    children.push(new Paragraph({ text: 'Sources', heading: HeadingLevel.HEADING_1, spacing: { before: 200 } }));
    children.push(new Paragraph({ text: '', spacing: { after: 100 } }));
    children.push(sourcesTable(report));
  }

  children.push(
    new Paragraph({
      text: 'Generated from application log data only. No information outside the retrieved log excerpts and aggregate statistics above was used.',
      alignment: AlignmentType.LEFT,
      spacing: { before: 300 },
    })
  );

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}
