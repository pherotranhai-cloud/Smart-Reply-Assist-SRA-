import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Shared Supabase client + admin data access.
 *
 * Both the Netlify function router (netlify/functions/api.ts) and the Express
 * server (server.ts) expose the same admin endpoints. This module is the single
 * implementation behind them so the two deploy targets cannot drift apart.
 */

export type DeviceStatus = 'good' | 'warning' | 'block';

export interface AdminStats {
  day: number;
  week: number;
  month: number;
  totalRequests: number;
}

export interface AdminData {
  stats: AdminStats;
  feedbacks: any[];
  logs: any[];
  ipTrackers: any[];
}

/** Builds the Supabase service-role client, or null when env vars are absent. */
export function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

/** Start-of-today, 7 days ago and 1 month ago, as ISO strings. */
function activityWindows() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  return {
    today: today.toISOString(),
    weekAgo: weekAgo.toISOString(),
    monthAgo: monthAgo.toISOString()
  };
}

/** Counts ip_tracker rows active since `since`. Returns 0 rather than throwing. */
async function countActiveSince(supabase: SupabaseClient, since: string): Promise<number> {
  try {
    const { count } = await (supabase as any)
      .from('ip_tracker')
      .select('*', { count: 'exact', head: true })
      .gte('last_request_at', since);
    return count || 0;
  } catch (err) {
    console.error('[adminService] Failed to count active users since', since, err);
    return 0;
  }
}

/** Active-user counts plus the lifetime app_logs total. */
export async function fetchStats(supabase: SupabaseClient): Promise<AdminStats> {
  const { today, weekAgo, monthAgo } = activityWindows();

  const [day, week, month] = await Promise.all([
    countActiveSince(supabase, today),
    countActiveSince(supabase, weekAgo),
    countActiveSince(supabase, monthAgo)
  ]);

  let totalRequests = 0;
  try {
    const { count } = await (supabase as any)
      .from('app_logs')
      .select('*', { count: 'exact', head: true });
    totalRequests = count || 0;
  } catch (err) {
    console.error('[adminService] Failed to count total requests:', err);
  }

  return { day, week, month, totalRequests };
}

/**
 * Most recent app_logs rows.
 *
 * Older deployments of the app_logs table have no ip_address column, so a
 * failure mentioning that column is retried without it and backfilled with ''.
 */
export async function fetchRecentLogs(supabase: SupabaseClient, limit = 100): Promise<any[]> {
  const { data, error } = await supabase
    .from('app_logs')
    .select('ip_address, input_text, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!error) return data || [];

  console.warn('[adminService] Failed to fetch logs with ip_address, retrying without it:', error.message);
  const { data: logsNoIp, error: retryError } = await supabase
    .from('app_logs')
    .select('input_text, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (retryError) throw retryError;
  return (logsNoIp || []).map((log: any) => ({ ...log, ip_address: '' }));
}

export async function fetchFeedbacks(supabase: SupabaseClient, limit = 50): Promise<any[]> {
  const { data } = await supabase
    .from('user_feedbacks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  return data || [];
}

export async function fetchIpTrackers(supabase: SupabaseClient): Promise<any[]> {
  const { data } = await (supabase as any)
    .from('ip_tracker')
    .select('*')
    .order('last_request_at', { ascending: false });
  return data || [];
}

/** Everything the admin dashboard needs, in one round of queries. */
export async function fetchAdminData(supabase: SupabaseClient): Promise<AdminData> {
  const [stats, feedbacks, logs, ipTrackers] = await Promise.all([
    fetchStats(supabase),
    fetchFeedbacks(supabase),
    fetchRecentLogs(supabase),
    fetchIpTrackers(supabase)
  ]);
  return { stats, feedbacks, logs, ipTrackers };
}

/**
 * Sets an ip_tracker row's status. Clearing back to 'good' also wipes spam_logs.
 * Returns false when `status` is not a recognised value.
 */
export async function setDeviceStatus(
  supabase: SupabaseClient,
  ipAddress: string,
  status: string
): Promise<boolean> {
  const allowed: DeviceStatus[] = ['good', 'warning', 'block'];
  if (!allowed.includes(status as DeviceStatus)) return false;

  const patch = status === 'good' ? { status: 'good', spam_logs: null } : { status };
  await (supabase as any).from('ip_tracker').update(patch).eq('ip_address', ipAddress);
  return true;
}
