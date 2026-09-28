/**
 * Shared types for the RAG admin assistant (shared/rag/*). Kept in one file
 * so the ingestion pipeline, search, and report/chat services agree on shape
 * without importing each other's internals.
 */

export interface LogRow {
  id: number;
  created_at: string | null;
  task_type: string | null;
  input_text: string | null;
  output_text: string | null;
  from_lang: string | null;
  to_lang: string | null;
}

export type Severity = 'none' | 'low' | 'medium' | 'high';

export interface LogClassification {
  module: string;
  severity: Severity;
  issueType: string | null;
}

export interface LogChunk {
  logId: number;
  chunkIndex: number;
  content: string;
  tokenEstimate: number;
  module: string;
  severity: Severity;
  issueType: string | null;
  fromLang: string | null;
  toLang: string | null;
  logCreatedAt: string | null;
  contentHash: string;
}

export interface SearchFilters {
  module?: string | null;
  severity?: string | null;
  issueType?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface SearchResult {
  id: number;
  logId: number;
  chunkIndex: number;
  content: string;
  module: string | null;
  severity: string | null;
  issueType: string | null;
  fromLang: string | null;
  toLang: string | null;
  logCreatedAt: string | null;
  similarity: number;
}

export interface SourceRef {
  logId: number;
  chunkIndex: number;
  timestamp: string | null;
  module: string | null;
  similarity: number;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export interface ChatAnswer {
  answer: string;
  sources: SourceRef[];
  confidence: ConfidenceLevel;
  confidenceScore: number;
  usedFallback: boolean;
}

export type ReportTemplateId = 'performance-impact' | 'quality-impact' | 'standards-issues';

export interface ReportSection {
  heading: string;
  content: string;
  sources: SourceRef[];
}

export interface LogStatRow {
  module: string | null;
  severity: string | null;
  issueType: string | null;
  logCount: number;
}

export interface Report {
  templateId: ReportTemplateId;
  title: string;
  generatedAt: string;
  filters: SearchFilters;
  summary: string;
  sections: ReportSection[];
  stats: LogStatRow[];
  sources: SourceRef[];
  confidence: ConfidenceLevel;
}

export interface IngestionResult {
  runId: number | null;
  status: 'completed' | 'completed_with_errors' | 'failed' | 'noop';
  trigger: string;
  logsScanned: number;
  logsEmbedded: number;
  logsFailed: number;
  chunksCreated: number;
  startedAt: string;
  finishedAt: string;
  errorMessage?: string;
}

export interface EmbeddingStatus {
  totalLogs: number;
  embeddedLogs: number;
  pendingLogs: number;
  lastRun: {
    id: number;
    trigger: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    logsScanned: number;
    logsEmbedded: number;
    logsFailed: number;
    chunksCreated: number;
    errorMessage: string | null;
  } | null;
  unresolvedErrorCount: number;
}
