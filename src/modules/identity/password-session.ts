import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/supabase/database.types';
import { AppError } from '@/lib/api/errors';

/** Supabase's default invite emails use implicit fragments even with an SSR PKCE client. */
export async function restorePasswordSession(client: SupabaseClient<Database>, fragment: string) {
  if (fragment) {
    const params = new URLSearchParams(fragment.replace(/^#/, ''));
    const type = params.get('type');
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if ((type !== 'invite' && type !== 'recovery') || !access_token || !refresh_token || params.has('error')) throw new AppError('UNAUTHENTICATED', 'Invalid invitation or reset link.');
    const result = await client.auth.setSession({ access_token, refresh_token });
    if (result.error) throw new AppError('UNAUTHENTICATED', 'This link has expired. Request a new one.');
  }
  const current = await client.auth.getUser();
  if (current.error || !current.data.user?.email_confirmed_at) throw new AppError('UNAUTHENTICATED', 'Open a valid invitation or password reset link first.');
}
