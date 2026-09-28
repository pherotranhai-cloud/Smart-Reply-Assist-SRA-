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
 * Scans app_logs for rows after the stored cursor, chunks and embeds them,
 * and upserts the result into log_embeddings — the daily job and the manual
 * "run now" admin action both call this. Incremental by construction: the
 * cursor only advances past a log once this run has attempted it, so a
 * re-run (the next scheduled tick, or a manual retry) never re-embeds a log
 * that already succeeded. A log whose embedding ultimately fails still lets
 * the cursor pass it — it is recorded in embedding_job_errors for visibility
 * instead of retried forever and blocking every log after it.
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
    while (logsScanned < config.maxLogsPerRun) {
      const pageLimit = Math.min(config.ingestionPageSize, config.maxLogsPerRun - logsScanned);
      const page = await fetchLogsPage(supabase, cursor, pageLimit);
      if (page.length === 0) break;

      const chunksByLog = new Map<number, LogChunk[]>();
      for (const log of page) {
        const classification = classifyLog(log);
        const chunks = chunkLog(log, classification, {
          chunkCharSize: config.chunkCharSize,
          chunkOverlapChars: config.chunkOverlapChars,
        });
        chunksByLog.set(log.id, chunks);
      }

      const allChunks = Array.from(chunksByLog.values()).flat();
      const { embedded, failed } = await embedChunksWithFallback(openai, allChunks, config);

      const failedLogIds = new Set(failed.map((f) => f.chunk.logId));
      for (const { chunk, error } of failed) {
        await recordChunkError(supabase, runId, chunk.logId, error.message);
      }

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

        const { error: upsertError } = await (supabase as any)
          .from('log_embeddings')
          .upsert(rows, { onConflict: 'log_id,chunk_index' });

        if (upsertError) {
          // The whole batch's DB write failed (not an embedding failure) — every
          // log in this page is unresolved; record each one and let the cursor
          // still advance past the page so a single bad page can't wedge the job.
          for (const log of page) {
            await recordChunkError(supabase, runId, log.id, `Upsert failed: ${upsertError.message}`);
            failedLogIds.add(log.id);
          }
        } else {
          chunksCreated += rows.length;
        }
      }

      for (const log of page) {
        if (failedLogIds.has(log.id)) logsFailed += 1;
        else logsEmbedded += 1;
      }
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
