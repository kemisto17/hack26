import { Suspense } from 'react';
import type { Metadata } from 'next';
import { requireStaff } from '@/components/staff-console/session';
import { StaffShell } from '@/components/staff-console/shell';
import './staff.css';
export const metadata: Metadata = { title: { default: 'Staff workspace | HACK26', template: '%s | HACK26 Operations' }, robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
 return <Suspense fallback={<div className="staff-loading" role="status">Verifying your staff account…</div>}><Authorized>{children}</Authorized></Suspense>;
}
async function Authorized({ children }: { children: React.ReactNode }) {
 const user = await requireStaff();
 return <StaffShell user={user}>{children}</StaffShell>;
}
