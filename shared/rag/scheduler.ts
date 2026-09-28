import type { SupabaseClient } from '@supabase/supabase-js';
import type OpenAI from 'openai';
import { loadRagConfig } from './config';
import { runIncrementalEmbeddingJob } from './ingestion';

/**
 * In-process "daily job" for the Express server (server.ts), which runs as a
 * long-lived process on Render. Netlify Functions are stateless per-request
 * and cannot host a setInterval, so that deploy target instead relies on an
 * external scheduler (Render Cron Job / GitHub Actions) hitting
 * POST /api/admin/rag/embeddings/run with RAG_CRON_SECRET — see
 * docs/rag-admin-assistant.md. Both paths call the same
 * runIncrementalEmbeddingJob, so neither one can double-embed a log the
 * other already processed.
 *
 * Checks every `schedulerCheckIntervalMs` (default hourly) whether at least
 * `schedulerRunIntervalMs` (default 24h) has passed since the last run *this
 * process* triggered, and if so runs the job. A restart forgets that
 * in-memory timestamp and simply runs again soon after startup — an extra
 * incremental run is harmless (there is nothing new to embed) and cheaper
 * than adding a startup delay to avoid it.
 */
export function startEmbeddingScheduler(supabase: SupabaseClient | null, openai: OpenAI): () => void {
  const config = loadRagConfig();
  let lastRunAt = 0;
  let running = false;

  const tick = async () => {
    if (!supabase || running) return;
    if (Date.now() - lastRunAt < config.schedulerRunIntervalMs) return;

    running = true;
    try {
      const result = await runIncrementalEmbeddingJob(supabase, openai, config, 'scheduler');
      lastRunAt = Date.now();
      console.log(
        `[rag/scheduler] Daily embedding run ${result.status}: scanned=${result.logsScanned} embedded=${result.logsEmbedded} failed=${result.logsFailed} chunks=${result.chunksCreated}`
      );
    } catch (err) {
      console.error('[rag/scheduler] Daily embedding run threw unexpectedly:', err);
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, config.schedulerCheckIntervalMs);
  // Fire once shortly after startup so a freshly deployed server doesn't wait
  // a full check interval before its first backfill pass.
  const initialTimer = setTimeout(tick, 30_000);

  return () => {
    clearInterval(timer);
    clearTimeout(initialTimer);
  };
}
