/**
 * Env-driven configuration for the RAG admin assistant. Every knob has a
 * sane default so the feature works with only OPENAI_API_KEY and the
 * existing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (shared/adminService.ts)
 * already set — nothing new is required to get a working deploy.
 */

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export interface RagConfig {
  /** OpenAI embedding model. 1536 dimensions — must match the vector(1536) column in log_embeddings. */
  embeddingModel: string;
  /** Chat model used for the chatbot and report synthesis. Falls back to the app's own APP_ENGINE_ID. */
  chatModel: string;
  /** Max chunk texts sent per OpenAI embeddings.create call. */
  embeddingBatchSize: number;
  /** Retries per embeddings batch before the chunk is recorded as failed. */
  embeddingMaxRetries: number;
  /** Target size of one chunk, in characters (~4 chars/token, so 3200 ≈ 800 tokens). */
  chunkCharSize: number;
  /** Overlap between consecutive chunks of the same long log, in characters. */
  chunkOverlapChars: number;
  /** Max app_logs rows scanned in a single ingestion run (keeps one run bounded on a huge backlog). */
  maxLogsPerRun: number;
  /** Page size when paging through app_logs during ingestion. */
  ingestionPageSize: number;
  /**
   * Max rows per `log_embeddings` upsert statement. Supabase's PostgREST
   * role has an 8s statement_timeout, and HNSW index maintenance cost per
   * inserted row grows with index size — a single upsert covering a whole
   * ingestion page (hundreds of vector(1536) rows) starts timing out once
   * the index holds several thousand vectors. Kept small and sub-batched
   * (shared/rag/ingestion.ts) so one statement always finishes well under
   * the limit regardless of how large the index has grown.
   */
  upsertBatchSize: number;
  /** Max previously-failed logs (embedding_job_errors, unresolved) retried per run, before scanning new logs. */
  reprocessBatchSize: number;
  /** Default number of chunks retrieved per semantic search call. */
  searchTopK: number;
  /** How often (ms) the in-process scheduler checks whether a daily run is due. */
  schedulerCheckIntervalMs: number;
  /** Minimum time (ms) between two successful ingestion runs before another is due. */
  schedulerRunIntervalMs: number;
  /** Optional extra shared secret for POST /admin/rag/embeddings/run, so an external cron (Render Cron Job, GitHub Actions) can trigger it without the human admin key. */
  cronSecret: string | undefined;
}

export function loadRagConfig(): RagConfig {
  return {
    embeddingModel: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
    chatModel: process.env.RAG_CHAT_MODEL || process.env.APP_ENGINE_ID || 'gpt-5.6-luna',
    embeddingBatchSize: num('RAG_EMBEDDING_BATCH_SIZE', 64),
    embeddingMaxRetries: num('RAG_EMBEDDING_MAX_RETRIES', 3),
    chunkCharSize: num('RAG_CHUNK_CHAR_SIZE', 3200),
    chunkOverlapChars: num('RAG_CHUNK_OVERLAP_CHARS', 400),
    maxLogsPerRun: num('RAG_MAX_LOGS_PER_RUN', 2000),
    ingestionPageSize: num('RAG_INGESTION_PAGE_SIZE', 200),
    upsertBatchSize: num('RAG_UPSERT_BATCH_SIZE', 20),
    reprocessBatchSize: num('RAG_REPROCESS_BATCH_SIZE', 200),
    searchTopK: num('RAG_SEARCH_TOP_K', 8),
    schedulerCheckIntervalMs: num('RAG_SCHEDULER_CHECK_INTERVAL_MS', 60 * 60 * 1000),
    schedulerRunIntervalMs: num('RAG_SCHEDULER_RUN_INTERVAL_MS', 24 * 60 * 60 * 1000),
    cronSecret: process.env.RAG_CRON_SECRET || undefined,
  };
}

export function isRagConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
