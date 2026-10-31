'use client';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from './confirm-dialog';
import { inviteAccount } from './identity-requests';

export function AdminInviteForm() {
  const router = useRouter();
  const [values, setValues] = useState({ display_name: '', email: '' });
  const [pending, setPending] = useState(false);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const lock = useRef(false);
  async function send() {
    if (lock.current) return;
    lock.current = true; setPending(true); setMessage(''); setFailed(false);
    try {
      await inviteAccount({ display_name: values.display_name.trim(), email: values.email.trim().toLowerCase() });
      setMessage('Invitation accepted by the service. The recipient can use the email link to set a password.');
      setValues({ display_name: '', email: '' }); setReview(false); router.refresh();
    } catch (error) {
      setFailed(true); setReview(false);
      setMessage(error instanceof Error ? error.message : 'Invitation failed. Retry the same email to reconcile its status.');
    } finally { lock.current = false; setPending(false); }
  }
  return <>
    <form className="staff-form" aria-busy={pending} onSubmit={event => {
      event.preventDefault();
      if (!values.display_name.trim()) { setFailed(true); setMessage('Enter a display name.'); return; }
      setReview(true);
    }}>
      <fieldset disabled={pending}>
        <label>Name<input name="display_name" autoComplete="name" required maxLength={200} value={values.display_name} onChange={event => setValues({ ...values, display_name: event.target.value })} /></label>
        <label>Email address<input name="email" autoComplete="email" type="email" required maxLength={254} value={values.email} onChange={event => setValues({ ...values, email: event.target.value })} /></label>
        <label>Invitation role<input value="Internal staff" readOnly /></label>
        <p>Invitations create internal staff accounts. Administrator promotion is a separate reviewed access change after account creation.</p>
        <button className="staff-button" disabled={pending}>Review invitation</button>
      </fieldset>
      {message && <p className={failed ? 'admin-form-error' : 'admin-form-success'} role={failed ? 'alert' : 'status'}>{message}</p>}
    </form>
    {review && <ConfirmDialog title="Send staff invitation?" pending={pending} confirmLabel="Send invitation" onCancel={() => setReview(false)} onConfirm={send}>
      <p>Invite <strong>{values.display_name.trim()}</strong> at <strong>{values.email.trim()}</strong> as internal staff.</p>
      <p>The identity service will send an account setup email. Retrying the same email uses its existing invitation workflow.</p>
    </ConfirmDialog>}
  </>;
}
