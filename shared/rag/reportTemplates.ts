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
          'Summarize request volume by module using the STATS block only (do not invent numbers). Note which modules carry the most traffic.',
      },
      {
        heading: 'Failure & Latency Signals',
        instruction:
          'From the SOURCE EXCERPTS, cite concrete instances of failed, empty, or unusually short/truncated responses. For each, name the module and timestamp exactly as given in the excerpt.',
      },
      {
        heading: 'Recommendations',
        instruction:
          '2-4 concrete, actionable recommendations grounded only in the evidence above. If the evidence is too sparse for a confident recommendation, say so instead of guessing.',
      },
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
        heading: 'Quality Concerns Found',
        instruction:
          'List concrete quality issues found in the SOURCE EXCERPTS, each with its timestamp, module, and a short quote of the problematic text. Do not describe an issue that is not actually present in an excerpt.',
      },
      {
        heading: 'Affected Modules & Languages',
        instruction:
          'Using the STATS block and the excerpts, summarize which modules and language pairs are most represented among the concerns.',
      },
      {
        heading: 'Recommendations',
        instruction:
          '2-4 concrete, actionable recommendations grounded only in the evidence above. If the evidence is too sparse for a confident recommendation, say so instead of guessing.',
      },
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
        heading: 'Issues Identified',
        instruction:
          'List each distinct issue found in the SOURCE EXCERPTS with its timestamp, module, and flagged issue type if one is present in the excerpt text.',
      },
      {
        heading: 'Severity Breakdown',
        instruction:
          'Using the STATS block, summarize how many logs fall into each severity/issue-type bucket. Do not invent a bucket that is not in STATS.',
      },
      {
        heading: 'Recommendations',
        instruction:
          '2-4 concrete, actionable recommendations grounded only in the evidence above. If the evidence is too sparse for a confident recommendation, say so instead of guessing.',
      },
    ],
  },
};

export function getReportTemplate(id: ReportTemplateId): ReportTemplateDef {
  const def = REPORT_TEMPLATES[id];
  if (!def) throw new Error(`Unknown report template: ${id}`);
  return def;
}
