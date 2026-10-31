'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnvironment } from '@/lib/env/public';
import type { Database } from './database.types';

export function createBrowserSupabaseClient() {
  const { url, key } = publicEnvironment();
  // Code/token-hash callbacks run on the server; invite fragments are handled explicitly.
  return createBrowserClient<Database>(url, key, { auth: { detectSessionInUrl: false } });
}
