import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { requireCustomer } from '@/components/customer-web/session';
import { PortalShell } from '@/components/customer-web/portal-shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="p-8" role="status">Loading your account…</p>}><Portal>{children}</Portal></Suspense>;
}
async function Portal({ children }: { children: React.ReactNode }) {
  const user = await requireCustomer();
  if (user.role !== 'customer') redirect('/');
  return <PortalShell user={user}>{children}</PortalShell>;
}
