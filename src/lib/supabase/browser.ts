'use client';
import { createBrowserClient } from '@supabase/ssr';
import { publicEnvironment } from '@/lib/env/public';
import type { Database } from './database.types';

export function createBrowserSupabaseClient() {
  const { url, key } = publicEnvironment();
  return createBrowserClient<Database>(url, key);
}
