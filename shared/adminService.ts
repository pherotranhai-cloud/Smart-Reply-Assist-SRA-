import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase client + admin data access.
 *
 * Both the Netlify function router (netlify/functions/api.ts) and the Express
 * server (server.ts) expose the same admin endpoints. This module is the single
 * implementation behind them so the two deploy targets cannot drift apart.
 */

export interface RecentResponse {
  task_type: string | null;
  input_text: string | null;
  output_text: string | null;
  from_lang: string | null;
  to_lang: string | null;
  created_at: string | null;
}

/** Builds the Supabase service-role client, or null when env vars are absent. */
export function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

/** Lifetime number of app_logs rows. Returns 0 rather than throwing. */
export async function countTotalRequests(supabase: SupabaseClient): Promise<number> {
  try {
    const { count, error } = await (supabase as any)
      .from('app_logs')
      .select('*', { count: 'exact', head: true });
    if (error) {
      console.error('[adminService] Failed to count total requests:', error.message);
      return 0;
    }
    return count || 0;
  } catch (err) {
    console.error('[adminService] Failed to count total requests:', err);
    return 0;
  }
}

/** Keeps a caller-supplied limit inside a range the dashboard can render. */
export function normalizeResponseLimit(limit: unknown, fallback = 50): number {
  const parsed = Math.floor(Number(limit));
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 200);
}

/**
 * The most recent app responses, newest first.
 *
 * Older deployments of app_logs are missing some of these columns, so a failed
 * query is retried with the minimal set every deployment is known to have and
 * the absent fields are backfilled with null. Never throws: an unreadable table
 * yields an empty list so the dashboard still renders.
 */
export async function fetchRecentResponses(
  supabase: SupabaseClient,
  rawLimit: unknown = 50
): Promise<RecentResponse[]> {
  const limit = normalizeResponseLimit(rawLimit);

  const { data, error } = await (supabase as any)
    .from('app_logs')
    .select('task_type, input_text, output_text, from_lang, to_lang, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!error) return (data || []) as RecentResponse[];

  console.warn(
    '[adminService] Failed to fetch recent responses with full columns, retrying with a minimal set:',
    error.message
  );

  const { data: minimal, error: retryError } = await (supabase as any)
    .from('app_logs')
    .select('input_text, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (retryError) {
    console.error('[adminService] Failed to fetch recent responses:', retryError.message);
    return [];
  }

  return (minimal || []).map((row: any) => ({
    task_type: null,
    input_text: row.input_text ?? null,
    output_text: null,
    from_lang: null,
    to_lang: null,
    created_at: row.created_at ?? null
  }));
}
