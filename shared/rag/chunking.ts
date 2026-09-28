import { createHash } from 'crypto';
import { LogChunk, LogClassification, LogRow } from './types';

/** ~4 characters per token is a standard rough estimate for English/Vietnamese mixed text. */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * The single self-contained text block a log row turns into before chunking.
 * Every field a source reference needs (module, timestamp, languages, flag)
 * is written into the text itself, so a chunk read on its own — without the
 * original row nearby — still carries that context into the LLM prompt.
 */
export function buildLogText(log: LogRow, classification: LogClassification): string {
  const lines = [
    `Module: ${classification.module}`,
    `Timestamp: ${log.created_at ?? 'unknown'}`,
    `Languages: ${log.from_lang ?? '?'} -> ${log.to_lang ?? '?'}`,
  ];
  if (classification.issueType) {
    lines.push(`Flag: ${classification.issueType} (severity: ${classification.severity})`);
  }
  lines.push(`Input: ${(log.input_text ?? '').trim() || '(empty)'}`);
  lines.push(`Output: ${(log.output_text ?? '').trim() || '(empty)'}`);
  return lines.join('\n');
}

/**
 * Splits `text` into overlapping character windows. Most app_logs rows are a
 * sentence or two and come back as a single chunk (text.length <= chunkSize);
 * the sliding window only matters for the rare long compose/expert-search
 * transcript, so a later semantic search still finds the relevant half of a
 * long entry instead of missing it under the context-window budget.
 */
export function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  const step = Math.max(1, chunkSize - overlap);

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += step;
  }

  return chunks;
}

export interface ChunkOptions {
  chunkCharSize: number;
  chunkOverlapChars: number;
}

/** Turns one app_logs row into one or more embeddable, independently-searchable chunks. */
export function chunkLog(
  log: LogRow,
  classification: LogClassification,
  opts: ChunkOptions
): LogChunk[] {
  const fullText = buildLogText(log, classification);
  const pieces = chunkText(fullText, opts.chunkCharSize, opts.chunkOverlapChars);

  return pieces.map((content, chunkIndex) => ({
    logId: log.id,
    chunkIndex,
    content,
    tokenEstimate: estimateTokens(content),
    module: classification.module,
    severity: classification.severity,
    issueType: classification.issueType,
    fromLang: log.from_lang,
    toLang: log.to_lang,
    logCreatedAt: log.created_at,
    contentHash: hashContent(content),
  }));
}
