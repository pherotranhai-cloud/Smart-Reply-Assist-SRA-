import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Builds the server-only Supabase service-role client, or null when the env
 * vars are absent. Shared by netlify/functions/api.ts and server.ts.
 */
export function createSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}
