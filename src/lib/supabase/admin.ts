import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { privilegedEnvironment } from '@/lib/env/server';
import type { Database } from './database.types';

/** Bypasses RLS. Owned services must verify current role/ownership before calling. */
export function createAdminClient() {
  const { url, key } = privilegedEnvironment();
  return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) } });
}
