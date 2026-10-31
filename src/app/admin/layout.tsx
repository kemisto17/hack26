import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AdminShell } from '@/components/admin-console/shell';
import { requireAdmin } from '@/components/admin-console/session';
import '../staff/staff.css';
import './admin.css';
export const metadata: Metadata = { title: { default: 'Administrator console | HACK26', template: '%s | HACK26 Admin' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div className="staff-loading" role="status">Verifying administrator access…</div>}><Authorized>{children}</Authorized></Suspense>;
}
async function Authorized({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin();
  return <AdminShell user={user}>{children}</AdminShell>;
}
