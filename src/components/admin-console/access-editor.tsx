'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Role } from '@/lib/api/contracts';
import type { UserDTO } from '@/modules/identity/contracts';
import { ConfirmDialog } from './confirm-dialog';
import { IdentityRequestError, updateAccountAccess } from './identity-requests';

export function AccessEditor({ user, currentAdminId }: { user: UserDTO; currentAdminId: string }) {
  const router = useRouter();
  const [current, setCurrent] = useState(user);
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.is_active);
  const [review, setReview] = useState(false);
  const [pending, setPending] = useState(false);
  const [stale, setStale] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  const changed = role !== current.role || active !== current.is_active;

  async function submit() {
    if (lock.current || stale) return;
    lock.current = true;
    setPending(true); setMessage(''); setFailed(false);
    try {
      const updated = await updateAccountAccess(current, { role, is_active: active });
      setCurrent(updated); setRole(updated.role); setActive(updated.is_active);
      setMessage('Account access updated.'); setReview(false);
      router.refresh();
    } catch (error) {
      setFailed(true); setReview(false);
      setMessage(error instanceof Error ? error.message : 'Access could not be updated.');
      // An uncertain network response must be reconciled, never blindly replayed.
      if (!(error instanceof IdentityRequestError) || ['VERSION_CONFLICT', 'UNREADABLE_RESPONSE'].includes(error.code)) setStale(true);
      if (error instanceof IdentityRequestError && [401, 403].includes(error.status)) router.refresh();
    } finally { lock.current = false; setPending(false); }
  }

  return <div className="admin-access-editor">
    <form className="staff-form" aria-label={`Account access for ${current.display_name}`} aria-busy={pending} onSubmit={event => { event.preventDefault(); if (changed && !stale) setReview(true); }}>
      <fieldset disabled={pending || stale}>
        <label>Role<select value={role} onChange={event => setRole(event.target.value as Role)}><option value="customer">Customer</option><option value="internal">Internal staff</option><option value="admin">Administrator</option></select></label>
        <label className="admin-checkbox"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} />Account active</label>
        <p>Disabling an account removes access. Role changes take effect through the identity service. The last active administrator is protected by the backend.</p>
        {user.id === currentAdminId && <p className="admin-sensitive-note">This is your own account. Removing administrator access will close your access to this console.</p>}
        <button className="staff-button" disabled={!changed || pending || stale}>Review access change</button>
      </fieldset>
      {message && <p className={failed ? 'admin-form-error' : 'admin-form-success'} role={failed ? 'alert' : 'status'}>{message}</p>}
      {stale && <button type="button" className="staff-button secondary" onClick={() => window.location.reload()}>Reload current account</button>}
    </form>
    {review && <ConfirmDialog title="Change account access?" pending={pending} confirmLabel="Confirm access change" onCancel={() => setReview(false)} onConfirm={submit}>
      <p><strong>{current.display_name || current.id}</strong></p>
      <dl><dt>Role</dt><dd>{current.role} → {role}</dd><dt>Status</dt><dd>{current.is_active ? 'Active' : 'Inactive'} → {active ? 'Active' : 'Inactive'}</dd></dl>
      <p>The service will verify your current permission and this account’s version before saving.</p>
    </ConfirmDialog>}
  </div>;
}
