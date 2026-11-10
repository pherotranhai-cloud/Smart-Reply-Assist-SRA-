import { createSupabaseClient } from './supabase';

/**
 * Usage logging into Supabase `app_logs`, shared by the Express/Netlify API
 * router (netlify/functions/api.ts) and the streaming translate function
 * (netlify/functions/translate.mts). Never throws: a logging failure must
 * not fail the request that produced the log.
 */
const supabase = createSupabaseClient();

export const logToSupabase = async (payload: any): Promise<void> => {
  if (!supabase) return;
  try {
    const insertPayload = {
      ...payload,
      created_at: new Date().toISOString()
    };
    const { error } = await supabase.from('app_logs').insert([insertPayload] as any);
    if (error) {
      console.error('Supabase logging error:', error);
      // Self-healing: if ip_address column does not exist in app_logs table, retry without it
      if (error.message && error.message.includes('ip_address') && 'ip_address' in insertPayload) {
        console.log('Retrying Supabase insert without ip_address...');
        const { ip_address, ...fallbackPayload } = insertPayload;
        const { error: retryError } = await supabase.from('app_logs').insert([fallbackPayload] as any);
        if (retryError) {
          console.error('Supabase logging retry error:', retryError);
        }
      }
    }
  } catch (err) {
    console.error('Supabase logging exception:', err);
  }
};
