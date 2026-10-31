import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { pageUser } from '@/modules/identity/shell';
import { ProfileForm } from '@/modules/identity/profile-form';

export default function PortalPage() {
  return <Suspense fallback={<p className="p-8" role="status">Loading profile…</p>}><Overview /></Suspense>;
}
async function Overview() {
  const user = await pageUser();
  if (user.role !== 'customer') redirect('/');
  return <main id="main-content" className="grid gap-10 py-8"><div><p className="text-sm uppercase tracking-widest opacity-60">Customer portal</p><h1 className="mt-2 text-3xl font-semibold">Your account</h1></div><ProfileForm key={user.version} user={user} /></main>;
}
