'use client';
import { useState, type FormEvent } from 'react';
import type { UserDTO } from './contracts';

export function ProfileForm({ user }: { user: UserDTO }) {
  const [current, setCurrent] = useState(user);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage('');
    const display_name = String(new FormData(event.currentTarget).get('display_name') ?? '');
    try {
      const response = await fetch('/api/v1/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${current.version}"` }, body: JSON.stringify({ display_name }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Profile update failed.');
      setCurrent(body.data); setMessage('Profile saved.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Profile update failed.'); }
    finally { setPending(false); }
  }
  return <section aria-labelledby="profile-heading" className="grid gap-4"><h2 id="profile-heading" className="text-xl font-semibold">Your profile</h2>
    <form onSubmit={submit} className="grid max-w-md gap-3" aria-busy={pending}>
      <label className="grid gap-1 text-sm">Display name<input name="display_name" className="form-input" defaultValue={user.display_name} maxLength={200} required /></label>
      <button className="form-button justify-self-start" disabled={pending}>{pending ? 'Saving…' : 'Save profile'}</button>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </form>
    <p className="text-sm opacity-75">Account ID: <span className="break-all font-mono">{current.id}</span></p>
  </section>;
}
