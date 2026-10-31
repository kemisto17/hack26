'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserSupabaseClient } from '@/lib/supabase/browser';

export function SignOut() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function signOut() {
    setPending(true); setMessage('');
    try {
      const result = await createBrowserSupabaseClient().auth.signOut({ scope: 'local' });
      if (result.error) throw result.error;
      router.replace('/login'); router.refresh();
    } catch { setMessage('Sign-out failed. Try again.'); setPending(false); }
  }
  return <div><button type="button" className="underline underline-offset-4 disabled:opacity-50" disabled={pending} onClick={signOut}>{pending ? 'Signing out…' : 'Sign out'}</button><p role="alert" className="text-sm">{message}</p></div>;
}
