import { AuthForm } from '@/modules/identity/auth-form';
import { Suspense } from 'react';

export default function Login({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<p className="p-8" role="status">Loading sign in…</p>}><LoginForm searchParams={searchParams} /></Suspense>;
}
async function LoginForm({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const notice = params.error === 'callback' ? 'This sign-in link is invalid or has expired. Sign in or request a new reset link.' : params.reason === 'account' ? 'Sign in with an active, confirmed account. Contact your admin if access is disabled.' : '';
  return <AuthForm mode="login" notice={notice} />;
}
