import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { pageUser, Shell } from '@/modules/identity/shell';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="p-8" role="status">Loading your account…</p>}><Portal>{children}</Portal></Suspense>;
}
async function Portal({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  if (user.role !== 'customer') redirect('/');
  return <Shell user={user}>{children}</Shell>;
}
