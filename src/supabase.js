import { createClient } from '@supabase/supabase-js';

const url = __SUPABASE_URL__;
const publishableKey = __SUPABASE_PUBLISHABLE_KEY__;

export const isSupabaseConfigured = Boolean(url && publishableKey);
export const supabase = isSupabaseConfigured
  ? createClient(url, publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

