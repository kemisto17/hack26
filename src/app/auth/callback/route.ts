import { NextResponse } from 'next/server';
import { createSessionClient } from '@/lib/supabase/server';
import { appOrigin } from '@/lib/env/server';
import { callbackPath } from '@/modules/identity/validation';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const client = await createSessionClient();
  const code = params.get('code');
  const token_hash = params.get('token_hash');
  const type = params.get('type');
  let valid = false;
  // Default Supabase invite mail returns tokens in the browser fragment, unseen here.
  // The password page explicitly sets that session and verifies getUser before updating.
  const implicitInvitation = !code && !token_hash && params.get('next') === '/update-password';
  if (code && !token_hash) {
    const result = await client.auth.exchangeCodeForSession(code);
    valid = !result.error;
  } else if (token_hash && !code && (type === 'signup' || type === 'recovery' || type === 'invite')) {
    const result = await client.auth.verifyOtp({ token_hash, type });
    valid = !result.error;
  }
  const path = valid || implicitInvitation ? callbackPath(params.get('next')) : '/login?error=callback';
  const response = NextResponse.redirect(new URL(path, appOrigin()), 303);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
