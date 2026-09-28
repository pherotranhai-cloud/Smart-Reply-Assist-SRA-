import { LogClassification, LogRow, Severity } from './types';

/**
 * task_type -> a human-readable module name for filtering/reporting. app_logs
 * has no dedicated "module" column, so the AI request type stands in for it.
 */
const MODULE_LABELS: Record<string, string> = {
  translate: 'Translation',
  ocr_translate: 'OCR Translation',
  compose: 'Composition',
  talk: 'Voice Talk',
  expert_search: 'Expert Search',
};

export function moduleForTaskType(taskType: string | null): string {
  if (!taskType || !taskType.trim()) return 'Unclassified';
  const known = MODULE_LABELS[taskType.trim().toLowerCase()];
  if (known) return known;
  // Unlisted task_type (a future feature's own log rows): title-case it
  // rather than dropping it into "Unclassified", so new modules show up in
  // filters/reports on their own the day they start logging.
  return taskType
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Keyword flags this heuristic looks for in output_text, English + Vietnamese
 * (the app's two working languages for shop-floor communication). Matched
 * case-insensitively as substrings — this is a cheap first-pass signal for
 * retrieval/report filtering, not a verdict; the chatbot and report LLM calls
 * still read the actual log text before drawing conclusions.
 */
const ERROR_KEYWORDS = [
  'error',
  'failed',
  'failure',
  'exception',
  'timeout',
  'undefined',
  'không thể',
  'lỗi',
  'thất bại',
];

/**
 * Heuristically classifies one log row into a module + severity + issue type,
 * purely from the row's own fields — no network calls, so this runs once per
 * row during ingestion without slowing it down. Pure and deterministic:
 * exercised directly by shared/rag/classify.test.ts without a database.
 */
export function classifyLog(log: LogRow): LogClassification {
  const module = moduleForTaskType(log.task_type);
  const input = (log.input_text ?? '').trim();
  const output = (log.output_text ?? '').trim();

  if (!output) {
    return { module, severity: 'high', issueType: 'empty_response' };
  }

  if (input.length > 20 && output.length < input.length * 0.15) {
    return { module, severity: 'medium', issueType: 'truncated_or_short_response' };
  }

  const haystack = output.toLowerCase();
  if (ERROR_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return { module, severity: 'medium', issueType: 'error_keyword_detected' };
  }

  return { module, severity: 'none', issueType: null };
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
      return 1;
    default:
      return 0;
  }
}
