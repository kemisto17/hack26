import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { publicEnvironment } from '@/lib/env/public';
import type { Database } from './database.types';

/** Per-request cookie/JWT client. Server Components refresh through src/proxy.ts. */
export async function createSessionClient() {
  // Auth's asynchronous initial-session event reads time; never start it in a prerender.
  await connection();
  const store = await cookies();
  const { url, key } = publicEnvironment();
  return createServerClient<Database>(url, key, { cookies: {
    getAll: () => store.getAll(),
    setAll(values) {
      try { values.forEach(({ name, value, options }) => store.set(name, value, options)); }
      catch (error) {
        // Only Server Components prohibit writes; mutation contexts must propagate failures.
        if (!(error instanceof Error) || !error.message.includes('Cookies can only be modified')) throw error;
      }
    },
  } });
}
