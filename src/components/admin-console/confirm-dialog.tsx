'use client';
import { useEffect, useRef, type ReactNode } from 'react';

export function ConfirmDialog({ title, children, pending, confirmLabel, onCancel, onConfirm }: {
  title: string; children: ReactNode; pending: boolean; confirmLabel: string;
  onCancel: () => void; onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return <dialog ref={ref} className="admin-dialog" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description" onCancel={event => {
    event.preventDefault();
    if (!pending) onCancel();
  }}>
    <h2 id="admin-confirm-title">{title}</h2>
    <div id="admin-confirm-description">{children}</div>
    <footer><button type="button" className="staff-button secondary" disabled={pending} onClick={onCancel} autoFocus>Keep current settings</button><button type="button" className="staff-button" disabled={pending} onClick={onConfirm}>{pending ? 'Submitting…' : confirmLabel}</button></footer>
  </dialog>;
}
