import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicEnvironment } from '@/lib/env/public';
import type { Database } from '@/lib/supabase/database.types';

export async function proxy(request: NextRequest) {
  const { url, key } = publicEnvironment();
  let response = NextResponse.next({ request });
  const client = createServerClient<Database>(url, key, { cookies: {
    getAll: () => request.cookies.getAll(),
    setAll(values, cacheHeaders) {
      values.forEach(({ name, value }) => request.cookies.set(name, value));
      response = NextResponse.next({ request });
      values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      Object.entries(cacheHeaders).forEach(([name, value]) => response.headers.set(name, value));
    },
  } });
  // Refresh cookies here; services independently verify the user and current active role.
  await client.auth.getUser();
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'] };
