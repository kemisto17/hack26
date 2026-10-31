import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { pageUser, Shell } from '@/modules/identity/shell';

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<p className="p-8" role="status">Loading workspace…</p>}><Workspace>{children}</Workspace></Suspense>;
}
async function Workspace({ children }: { children: React.ReactNode }) {
  const user = await pageUser();
  if (user.role === 'customer') redirect('/portal');
  return <Shell user={user}>{children}</Shell>;
}
