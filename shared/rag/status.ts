import type { SupabaseClient } from '@supabase/supabase-js';
import { EmbeddingStatus } from './types';

/** Snapshot of ingestion coverage + the most recent run, for the admin status widget. */
export async function getEmbeddingStatus(supabase: SupabaseClient): Promise<EmbeddingStatus> {
  const [totalLogsRes, embeddedLogsRes, lastRunRes, unresolvedErrorsRes] = await Promise.all([
    (supabase as any).from('app_logs').select('*', { count: 'exact', head: true }),
    (supabase as any).from('log_embeddings').select('*', { count: 'exact', head: true }).eq('chunk_index', 0),
    (supabase as any).from('embedding_job_runs').select('*').order('started_at', { ascending: false }).limit(1),
    (supabase as any).from('embedding_job_errors').select('*', { count: 'exact', head: true }).eq('resolved', false),
  ]);

  const totalLogs = totalLogsRes.count ?? 0;
  const embeddedLogs = embeddedLogsRes.count ?? 0;
  const lastRunRow = lastRunRes.data?.[0] ?? null;

  return {
    totalLogs,
    embeddedLogs,
    pendingLogs: Math.max(0, totalLogs - embeddedLogs),
    lastRun: lastRunRow
      ? {
          id: lastRunRow.id,
          trigger: lastRunRow.trigger,
          status: lastRunRow.status,
          startedAt: lastRunRow.started_at,
          finishedAt: lastRunRow.finished_at,
          logsScanned: lastRunRow.logs_scanned,
          logsEmbedded: lastRunRow.logs_embedded,
          logsFailed: lastRunRow.logs_failed,
          chunksCreated: lastRunRow.chunks_created,
          errorMessage: lastRunRow.error_message,
        }
      : null,
    unresolvedErrorCount: unresolvedErrorsRes.count ?? 0,
  };
}
