import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { classifyLog } from './classify';
import { chunkLog } from './chunking';
import { RagConfig } from './config';
import { embedTexts } from './embeddings';
import { IngestionResult, LogChunk, LogRow } from './types';

async function getCursor(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await (supabase as any)
    .from('embedding_sync_state')
    .select('last_log_id')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw new Error(`Failed to read embedding_sync_state: ${error.message}`);
  return data?.last_log_id ?? 0;
}

async function setCursor(supabase: SupabaseClient, lastLogId: number): Promise<void> {
  const { error } = await (supabase as any)
    .from('embedding_sync_state')
    .update({ last_log_id: lastLogId, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) throw new Error(`Failed to advance embedding_sync_state: ${error.message}`);
}

async function fetchLogsPage(
  supabase: SupabaseClient,
  afterId: number,
  limit: number
): Promise<LogRow[]> {
  const { data, error } = await (supabase as any)
    .from('app_logs')
    .select('id, created_at, task_type, input_text, output_text, from_lang, to_lang')
    .gt('id', afterId)
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`Failed to fetch app_logs page: ${error.message}`);
  return (data || []) as LogRow[];
}

async function createJobRun(supabase: SupabaseClient, trigger: string): Promise<number> {
  const { data, error } = await (supabase as any)
    .from('embedding_job_runs')
    .insert([{ trigger, status: 'running' }])
    .select('id')
    .single();
  if (error) throw new Error(`Failed to create embedding_job_runs row: ${error.message}`);
  return data.id;
}

async function finalizeJobRun(
  supabase: SupabaseClient,
  runId: number,
  fields: {
    status: string;
    logsScanned: number;
    logsEmbedded: number;
    logsFailed: number;
    chunksCreated: number;
    errorMessage?: string;
  }
): Promise<void> {
  await (supabase as any)
    .from('embedding_job_runs')
    .update({
      status: fields.status,
      finished_at: new Date().toISOString(),
      logs_scanned: fields.logsScanned,
      logs_embedded: fields.logsEmbedded,
      logs_failed: fields.logsFailed,
      chunks_created: fields.chunksCreated,
      error_message: fields.errorMessage ?? null,
    })
    .eq('id', runId);
}

async function recordChunkError(
  supabase: SupabaseClient,
  runId: number | null,
  logId: number,
  errorMessage: string
): Promise<void> {
  try {
    await (supabase as any)
      .from('embedding_job_errors')
      .insert([{ job_run_id: runId, log_id: logId, error_message: errorMessage.slice(0, 2000) }]);
  } catch (err) {
    console.error('[rag/ingestion] Failed to record embedding_job_errors row:', err);
  }
}

/** Distinct log ids with at least one unresolved error, oldest first — the backlog runs retry before scanning new logs. */
async function fetchUnresolvedFailedLogIds(supabase: SupabaseClient, limit: number): Promise<number[]> {
  const { data, error } = await (supabase as any)
    .from('embedding_job_errors')
    .select('log_id')
    .eq('resolved', false)
    .order('log_id', { ascending: true })
    .limit(limit * 4); // several error rows can share a log_id across runs; over-fetch before de-duplicating
  if (error) throw new Error(`Failed to fetch unresolved embedding_job_errors: ${error.message}`);
  const seen = new Set<number>();
  for (const row of data || []) seen.add(row.log_id);
  return Array.from(seen).slice(0, limit);
}

async function fetchLogsByIds(supabase: SupabaseClient, ids: number[]): Promise<LogRow[]> {
  if (ids.length === 0) return [];
  const { data, error } = await (supabase as any)
    .from('app_logs')
    .select('id, created_at, task_type, input_text, output_text, from_lang, to_lang')
    .in('id', ids);
  if (error) throw new Error(`Failed to fetch app_logs by id: ${error.message}`);
  return (data || []) as LogRow[];
}

/** Marks every unresolved error for `logId` resolved once it has successfully embedded. */
async function resolveErrorsForLog(supabase: SupabaseClient, logId: number): Promise<void> {
  await (supabase as any)
    .from('embedding_job_errors')
    .update({ resolved: true })
    .eq('log_id', logId)
    .eq('resolved', false);
}

/**
 * A retry attempt failed again: refreshes the existing unresolved row(s)
 * rather than growing the table with a duplicate insert per run.
 * attempt_count is left as-is (informational only) — PostgREST has no
 * atomic increment, and a fetch-then-write round trip isn't worth it here.
 */
async function bumpErrorsForLog(supabase: SupabaseClient, logId: number, errorMessage: string): Promise<void> {
  await (supabase as any)
    .from('embedding_job_errors')
    .update({ last_attempted_at: new Date().toISOString(), error_message: errorMessage.slice(0, 2000) })
    .eq('log_id', logId)
    .eq('resolved', false);
}

interface EmbeddedChunk {
  chunk: LogChunk;
  embedding: number[];
}

/**
 * Embeds every chunk in `chunks`, batched for throughput. A batch that fails
 * (after embedTexts' own retries) is retried chunk-by-chunk so one bad chunk
 * — oversized input, a transient per-item error — doesn't take its whole
 * batch down with it; only the chunks that still fail after that are
 * reported in `failed`.
 */
async function embedChunksWithFallback(
  openai: OpenAI,
  chunks: LogChunk[],
  config: RagConfig
): Promise<{ embedded: EmbeddedChunk[]; failed: { chunk: LogChunk; error: Error }[] }> {
  const embedded: EmbeddedChunk[] = [];
  const failed: { chunk: LogChunk; error: Error }[] = [];

  try {
    const vectors = await embedTexts(
      openai,
      chunks.map((c) => c.content),
      { model: config.embeddingModel, batchSize: config.embeddingBatchSize, maxRetries: config.embeddingMaxRetries }
    );
    chunks.forEach((chunk, i) => embedded.push({ chunk, embedding: vectors[i] }));
    return { embedded, failed };
  } catch {
    // Fall through to per-chunk isolation below.
  }

  for (const chunk of chunks) {
    try {
      const [vector] = await embedTexts(openai, [chunk.content], {
        model: config.embeddingModel,
        batchSize: 1,
        maxRetries: config.embeddingMaxRetries,
      });
      embedded.push({ chunk, embedding: vector });
    } catch (err: any) {
      failed.push({ chunk, error: err instanceof Error ? err : new Error(String(err)) });
    }
  }

  return { embedded, failed };
}

/**
 * Upserts `rows` in small sub-batches rather than one statement. Supabase's
 * PostgREST role has an 8s statement_timeout, and HNSW index-maintenance
 * cost per inserted row grows with index size — a single upsert covering an
 * entire ingestion page (hundreds of vector(1536) rows) is what was timing
 * out in production once the index passed a few thousand vectors. A batch
 * that still fails is retried row-by-row so one slow/oversized row can't
 * take the rest of the batch down with it.
 */
async function upsertEmbeddingRowsInBatches(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[],
  batchSize: number
): Promise<{ succeededCount: number; failed: { logId: number; error: string }[] }> {
  let succeededCount = 0;
  const failed: { logId: number; error: string }[] = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await (supabase as any)
      .from('log_embeddings')
      .upsert(batch, { onConflict: 'log_id,chunk_index' });

    if (!error) {
      succeededCount += batch.length;
      continue;
    }

    for (const row of batch) {
      const { error: singleError } = await (supabase as any)
        .from('log_embeddings')
        .upsert([row], { onConflict: 'log_id,chunk_index' });
      if (singleError) failed.push({ logId: row.log_id as number, error: singleError.message });
      else succeededCount += 1;
    }
  }

  return { succeededCount, failed };
}

interface ProcessLogsResult {
  embeddedLogIds: Set<number>;
  failedLogIds: Set<number>;
  chunksCreated: number;
}

/**
 * Classifies, chunks, embeds and upserts one batch of log rows — the single
 * pipeline shared by both the cursor-based scan of new logs and the
 * reprocessing pass over previously-failed ones, so the two can never drift
 * apart on how a log is turned into embeddings.
 */
async function processLogs(
  supabase: SupabaseClient,
  openai: OpenAI,
  config: RagConfig,
  runId: number | null,
  logs: LogRow[]
): Promise<ProcessLogsResult> {
  const chunksByLog = new Map<number, LogChunk[]>();
  for (const log of logs) {
    const classification = classifyLog(log);
    const chunks = chunkLog(log, classification, {
      chunkCharSize: config.chunkCharSize,
      chunkOverlapChars: config.chunkOverlapChars,
    });
    chunksByLog.set(log.id, chunks);
  }

  const allChunks = Array.from(chunksByLog.values()).flat();
  const { embedded, failed: embedFailed } = await embedChunksWithFallback(openai, allChunks, config);

  const failedLogIds = new Set(embedFailed.map((f) => f.chunk.logId));
  for (const { chunk, error } of embedFailed) {
    await recordChunkError(supabase, runId, chunk.logId, error.message);
  }

  let chunksCreated = 0;
  if (embedded.length > 0) {
    const rows = embedded.map(({ chunk, embedding }) => ({
      log_id: chunk.logId,
      chunk_index: chunk.chunkIndex,
      content: chunk.content,
      content_hash: chunk.contentHash,
      embedding,
      module: chunk.module,
      severity: chunk.severity,
      issue_type: chunk.issueType,
      from_lang: chunk.fromLang,
      to_lang: chunk.toLang,
      log_created_at: chunk.logCreatedAt,
      token_estimate: chunk.tokenEstimate,
    }));

    const { succeededCount, failed: upsertFailed } = await upsertEmbeddingRowsInBatches(
      supabase,
      rows,
      config.upsertBatchSize
    );
    chunksCreated += succeededCount;

    for (const f of upsertFailed) {
      await recordChunkError(supabase, runId, f.logId, `Upsert failed: ${f.error}`);
      failedLogIds.add(f.logId);
    }
  }

  const embeddedLogIds = new Set(logs.map((l) => l.id).filter((id) => !failedLogIds.has(id)));
  return { embeddedLogIds, failedLogIds, chunksCreated };
}

/**
 * Scans app_logs for rows after the stored cursor, chunks and embeds them,
 * and upserts the result into log_embeddings — the daily job and the manual
 * "run now" admin action both call this. Incremental by construction: the
 * cursor only advances past a log once this run has attempted it, so a
 * re-run (the next scheduled tick, or a manual retry) never re-embeds a log
 * that already succeeded. A log whose embedding ultimately fails still lets
 * the cursor pass it — it is recorded in embedding_job_errors and retried by
 * this same run's reprocessing pass on a future run, rather than retried
 * forever in place and blocking every log after it.
 */
export async function runIncrementalEmbeddingJob(
  supabase: SupabaseClient,
  openai: OpenAI,
  config: RagConfig,
  trigger: string = 'manual'
): Promise<IngestionResult> {
  const startedAt = new Date().toISOString();
  let runId: number | null = null;

  try {
    runId = await createJobRun(supabase, trigger);
  } catch (err: any) {
    console.error('[rag/ingestion] Failed to create job run row:', err);
  }

  let cursor: number;
  try {
    cursor = await getCursor(supabase);
  } catch (err: any) {
    const finishedAt = new Date().toISOString();
    if (runId) await finalizeJobRun(supabase, runId, { status: 'failed', logsScanned: 0, logsEmbedded: 0, logsFailed: 0, chunksCreated: 0, errorMessage: err.message });
    return { runId, status: 'failed', trigger, logsScanned: 0, logsEmbedded: 0, logsFailed: 0, chunksCreated: 0, startedAt, finishedAt, errorMessage: err.message };
  }

  let logsScanned = 0;
  let logsEmbedded = 0;
  let logsFailed = 0;
  let chunksCreated = 0;
  let fatalError: string | undefined;

  try {
    // Reprocess the backlog first: logs that failed on a previous run (most
    // commonly the upsert-timeout bug this pass exists to recover from) are
    // retried here instead of being stuck forever — the cursor already
    // passed them, so nothing else will ever revisit them otherwise.
    if (config.reprocessBatchSize > 0) {
      const failedIds = await fetchUnresolvedFailedLogIds(supabase, config.reprocessBatchSize);
      if (failedIds.length > 0) {
        const logs = await fetchLogsByIds(supabase, failedIds);
        const result = await processLogs(supabase, openai, config, runId, logs);

        for (const id of result.embeddedLogIds) await resolveErrorsForLog(supabase, id);
        for (const id of result.failedLogIds) await bumpErrorsForLog(supabase, id, 'Retried and failed again — see embedding_job_errors for the latest cause.');

        logsScanned += logs.length;
        logsEmbedded += result.embeddedLogIds.size;
        logsFailed += result.failedLogIds.size;
        chunksCreated += result.chunksCreated;
      }
    }

    while (logsScanned < config.maxLogsPerRun) {
      const pageLimit = Math.min(config.ingestionPageSize, config.maxLogsPerRun - logsScanned);
      const page = await fetchLogsPage(supabase, cursor, pageLimit);
      if (page.length === 0) break;

      const result = await processLogs(supabase, openai, config, runId, page);

      logsEmbedded += result.embeddedLogIds.size;
      logsFailed += result.failedLogIds.size;
      chunksCreated += result.chunksCreated;
      logsScanned += page.length;

      cursor = page[page.length - 1].id;
      await setCursor(supabase, cursor);

      if (page.length < pageLimit) break; // last page was short: no more rows to scan
    }
  } catch (err: any) {
    fatalError = err.message ?? String(err);
    console.error('[rag/ingestion] Ingestion run failed mid-batch:', err);
  }

  const finishedAt = new Date().toISOString();
  const status: IngestionResult['status'] = fatalError
    ? 'failed'
    : logsScanned === 0
      ? 'noop'
      : logsFailed > 0
        ? 'completed_with_errors'
        : 'completed';

  if (runId) {
    await finalizeJobRun(supabase, runId, {
      status,
      logsScanned,
      logsEmbedded,
      logsFailed,
      chunksCreated,
      errorMessage: fatalError,
    });
  }

  return {
    runId,
    status,
    trigger,
    logsScanned,
    logsEmbedded,
    logsFailed,
    chunksCreated,
    startedAt,
    finishedAt,
    errorMessage: fatalError,
  };
}
