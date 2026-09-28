import { ReportTemplateId } from './types';

export interface ReportSectionSpec {
  heading: string;
  instruction: string;
}

export interface ReportTemplateDef {
  id: ReportTemplateId;
  title: string;
  description: string;
  /** Several retrieval angles merged together, so the report isn't limited to whatever one phrasing of the topic happens to match best. */
  semanticQueries: string[];
  sections: ReportSectionSpec[];
}

/**
 * Section shape modeled on the org's own internal efficiency reports (e.g.
 * "Key Issue of Current Efficiency Supported by Data"): each finding is a
 * numbered issue with an explicit Cause and Impact, grounded in concrete
 * counts and named specifics (module, timestamp, quoted phrase) rather than
 * general prose — the same discipline that report uses for production
 * lines/models, applied here to log modules/timestamps/excerpts.
 */
const KEY_ISSUES_FORMAT = `Format this section as a numbered list of distinct issues, in the exact Markdown style below — do not write free-form prose instead:

1. [Short, specific issue title]
**Cause:** [what the SOURCE EXCERPTS show caused it — quote or closely paraphrase the excerpt, naming the exact module and timestamp]
**Impact:** [the concrete, quantified effect — a count from STATS, a number of affected logs, or another figure actually present in the evidence; never a vague phrase like "may affect users"]

Repeat for every distinct issue the evidence supports (do not pad to reach a target count, and do not invent an issue that isn't backed by an excerpt or a STATS number).`;

const OVERALL_RESULT_SECTION: ReportSectionSpec = {
  heading: 'Overall Result',
  instruction:
    'One short paragraph, in the style of a closing "Overall Performance Result" line: state the total logs reviewed and the headline finding as a concrete before/after or proportion (e.g. "X of Y logs in module Z were flagged, Q% of total volume"), using only numbers from the STATS block. No new claims — this section only rolls up figures already given above.',
};

const RECOMMENDATIONS_SECTION: ReportSectionSpec = {
  heading: 'Recommendations',
  instruction:
    '2-4 concrete, actionable recommendations, each tied to one of the numbered issues above by name. If the evidence is too sparse for a confident recommendation, say so instead of guessing.',
};

export const REPORT_TEMPLATES: Record<ReportTemplateId, ReportTemplateDef> = {
  'performance-impact': {
    id: 'performance-impact',
    title: 'Performance Impact Report',
    description: 'Request volume, throughput, and latency/failure signals across modules.',
    semanticQueries: [
      'slow response, timeout, delayed translation or composition',
      'empty response, failed request, no output generated',
      'high volume usage pattern, repeated or bursty requests',
    ],
    sections: [
      {
        heading: 'Volume & Throughput',
        instruction:
          'Summarize request volume by module using the STATS block only (do not invent numbers). Name the busiest module and its exact count, and any module whose failure/truncation counts are large relative to its own volume (a rate, not just a raw count).',
      },
      {
        heading: 'Key Issues (Cause & Impact)',
        instruction: `Cover failed, empty, or unusually slow/truncated responses found in the SOURCE EXCERPTS. ${KEY_ISSUES_FORMAT}`,
      },
      OVERALL_RESULT_SECTION,
      RECOMMENDATIONS_SECTION,
    ],
  },
  'quality-impact': {
    id: 'quality-impact',
    title: 'Quality Impact Report',
    description: 'Translation/composition quality concerns: mistranslation, truncation, terminology mismatches.',
    semanticQueries: [
      'wrong translation, mistranslation, incorrect terminology, glossary mismatch',
      'truncated or incomplete output, response much shorter than the input',
      'unclear or low quality composed message',
    ],
    sections: [
      {
        heading: 'Key Issues (Cause & Impact)',
        instruction: `Cover mistranslation, truncation, and terminology-mismatch concerns found in the SOURCE EXCERPTS — do not describe an issue that is not actually present in an excerpt. ${KEY_ISSUES_FORMAT}`,
      },
      {
        heading: 'Affected Modules & Languages',
        instruction:
          'Using the STATS block and the excerpts, name which modules and language pairs are most represented among the concerns, with their exact counts.',
      },
      OVERALL_RESULT_SECTION,
      RECOMMENDATIONS_SECTION,
    ],
  },
  'standards-issues': {
    id: 'standards-issues',
    title: 'Standards and Issues Report',
    description: 'Deviations from expected behavior: errors, empty responses, and flagged issue types.',
    semanticQueries: [
      'error message, exception, invalid input, system failure',
      'empty response, no output generated',
      'unexpected or non-standard behavior, policy deviation',
    ],
    sections: [
      {
        heading: 'Key Issues (Cause & Impact)',
        instruction: `Cover each distinct deviation found in the SOURCE EXCERPTS, naming its flagged issue type where one is present in the excerpt text. ${KEY_ISSUES_FORMAT}`,
      },
      {
        heading: 'Severity Breakdown',
        instruction:
          'Using the STATS block, give the exact count for each severity/issue-type bucket. Do not invent a bucket that is not in STATS.',
      },
      OVERALL_RESULT_SECTION,
      RECOMMENDATIONS_SECTION,
    ],
  },
};

export function getReportTemplate(id: ReportTemplateId): ReportTemplateDef {
  const def = REPORT_TEMPLATES[id];
  if (!def) throw new Error(`Unknown report template: ${id}`);
  return def;
}
