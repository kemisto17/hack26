'use client';
import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';
import { displayName, emailAddress, passwordHelp, validatePassword } from './validation';
import { restorePasswordSession } from './password-session';

type Mode = 'login' | 'signup' | 'reset' | 'update-password';
const titles: Record<Mode, string> = { login: 'Sign in', signup: 'Create your account', reset: 'Reset your password', 'update-password': 'Set a new password' };
export function AuthForm({ mode, notice = '' }: { mode: Mode; notice?: string }) {
  const router = useRouter();
  const [message, setMessage] = useState(notice);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);
  const [sessionReady, setSessionReady] = useState(mode !== 'update-password');
  useEffect(() => {
    if (mode !== 'update-password') return;
    let active = true;
    const fragment = window.location.hash;
    if (fragment) window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    void restorePasswordSession(createBrowserSupabaseClient(), fragment).then(() => {
      if (active) setSessionReady(true);
    }).catch(error => { if (active) { setFailed(true); setMessage(error instanceof Error ? error.message : 'Could not verify this link. Request a new one.'); } });
    return () => { active = false; };
  }, [mode]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(''); setFailed(false); setPending(true);
    const fields = new FormData(event.currentTarget);
    try {
      const client = createBrowserSupabaseClient();
      const email = mode === 'update-password' ? '' : emailAddress(fields.get('email'));
      const password = mode === 'signup' || mode === 'update-password' ? validatePassword(fields.get('password')) : String(fields.get('password') ?? '');
      if (mode === 'login') {
        const result = await client.auth.signInWithPassword({ email, password });
        if (result.error) throw new Error('Sign-in failed. Check your credentials and confirm your email.');
        router.replace('/'); router.refresh();
      } else if (mode === 'signup') {
        const result = await client.auth.signUp({ email, password, options: { data: { display_name: displayName(fields.get('display_name')) }, emailRedirectTo: `${window.location.origin}/auth/callback?next=/` } });
        if (result.error) throw new Error('Signup could not be completed. Check the password rules or try again later.');
        setMessage('Check your email to confirm your account before signing in.');
      } else if (mode === 'reset') {
        await client.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/auth/callback?next=/update-password` });
        setMessage('If an account exists for this email, you will receive a password reset link.');
      } else {
        if (!sessionReady) throw new Error('Open a valid invitation or password reset link first.');
        const current = await client.auth.getUser();
        if (current.error || !current.data.user) throw new Error('Open a valid invitation or password reset link first.');
        const result = await client.auth.updateUser({ password });
        if (result.error) throw new Error('Password could not be updated. Use a different valid password or request a new link.');
        router.replace('/'); router.refresh();
      }
    } catch (error) {
      setFailed(true); setMessage(error instanceof Error ? error.message : 'Please try again.');
    } finally { setPending(false); }
  }
  const needsPassword = mode !== 'reset';
  return <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-16">
    <Link href="/" className="text-sm font-semibold tracking-widest">BRIGHTLOOP</Link>
    <div><h1 className="text-3xl font-semibold tracking-tight">{titles[mode]}</h1><p className="mt-2 text-sm opacity-75">Manage your account and subscriptions.</p></div>
    <form onSubmit={submit} className="grid gap-4" aria-busy={pending}>
      {mode === 'signup' && <label className="grid gap-1 text-sm">Display name<input className="form-input" name="display_name" autoComplete="name" maxLength={200} required /></label>}
      {mode !== 'update-password' && <label className="grid gap-1 text-sm">Email<input className="form-input" name="email" type="email" autoComplete="email" maxLength={254} required /></label>}
      {needsPassword && <label className="grid gap-1 text-sm">Password<input className="form-input" name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? undefined : 9} aria-describedby={mode === 'login' ? undefined : 'password-help'} required /></label>}
      {needsPassword && mode !== 'login' && <p id="password-help" className="text-sm opacity-75">{passwordHelp}</p>}
      <button className="form-button" disabled={pending || !sessionReady}>{pending ? 'Please wait…' : titles[mode]}</button>
      <p role={failed ? 'alert' : 'status'} aria-live="polite" className="text-sm">{message}</p>
    </form>
    <nav aria-label="Account" className="flex flex-wrap gap-4 text-sm underline underline-offset-4">
      {mode !== 'login' && <Link href="/login">Sign in</Link>}
      {mode !== 'signup' && <Link href="/signup">Create account</Link>}
      {mode !== 'reset' && <Link href="/reset-password">Forgot password?</Link>}
    </nav>
  </main>;
}
