'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { UserDTO } from './contracts';

export function InvitationForm() {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage('');
    const form = event.currentTarget;
    const fields = new FormData(form);
    try {
      const response = await fetch('/api/v1/staff/invitations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: fields.get('email'), display_name: fields.get('display_name') }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Invitation failed.');
      form.reset(); setMessage('Invitation accepted. The recipient can use the email link to set a password.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Invitation failed.'); }
    finally { setPending(false); }
  }
  return <section aria-labelledby="invite-heading" className="grid gap-4"><h2 id="invite-heading" className="text-xl font-semibold">Invite internal staff</h2>
    <form onSubmit={submit} className="grid max-w-md gap-3" aria-busy={pending}>
      <label className="grid gap-1 text-sm">Name<input className="form-input" name="display_name" maxLength={200} required /></label>
      <label className="grid gap-1 text-sm">Email<input className="form-input" name="email" type="email" maxLength={254} required /></label>
      <button className="form-button justify-self-start" disabled={pending}>{pending ? 'Inviting…' : 'Send invitation'}</button>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </form>
  </section>;
}
export function AccessControls({ user }: { user: UserDTO }) {
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setMessage('');
    const fields = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/v1/users/${user.id}/access`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${user.version}"` }, body: JSON.stringify({ role: fields.get('role'), is_active: fields.get('is_active') === 'on' }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? 'Access update failed.');
      setMessage('Access saved.'); router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Access update failed.'); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} className="flex flex-wrap items-end gap-3" aria-label={`Access for ${user.display_name || user.id}`} aria-busy={pending}>
    <label className="grid gap-1 text-sm">Role<select className="form-input" name="role" defaultValue={user.role}><option value="customer">Customer</option><option value="internal">Internal staff</option><option value="admin">Admin</option></select></label>
    <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" name="is_active" defaultChecked={user.is_active} />Active</label>
    <button className="form-button" disabled={pending}>{pending ? 'Saving…' : 'Save access'}</button>
    <p role="status" aria-live="polite" className="w-full text-sm">{message}</p>
  </form>;
}
