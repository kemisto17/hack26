import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { listAccessUsers, listCustomers, requireActor } from '@/modules/identity/service';
import { MarketingHome } from '@/components/customer-web/marketing';
import { pageUser, Shell } from '@/modules/identity/shell';
import { ProfileForm } from '@/modules/identity/profile-form';
import { AccessControls, InvitationForm } from '@/modules/identity/access-controls';
import { AppError } from '@/lib/api/errors';

export default function Home({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <Suspense fallback={<MarketingHome/>}><HomeEntry searchParams={searchParams} /></Suspense>;
}
async function HomeEntry({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  try { const actor = await requireActor(); if (actor.role === 'customer') redirect('/portal/dashboard'); }
  catch(error) { if(error instanceof AppError && ['UNAUTHENTICATED','FORBIDDEN'].includes(error.code)) return <MarketingHome/>; throw error; }
  return <Workspace searchParams={searchParams}/>;
}
async function Workspace({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await pageUser();
  if (user.role === 'customer') redirect('/portal');
  const params = await searchParams;
  const cursor = params.cursor;
  let directory;
  let message = '';
  try {
    if (cursor !== undefined && typeof cursor !== 'string') throw new AppError('VALIDATION_ERROR', 'Invalid directory cursor.');
    directory = await (user.role === 'admin' ? listAccessUsers(user, cursor ? { cursor } : {}) : listCustomers(user, cursor ? { cursor } : {}));
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'VALIDATION_ERROR') throw error;
    message = 'That directory link is invalid. Return to the first page.';
  }
  return <Shell user={user}><main id="main-content" className="grid gap-10 py-8">
    <div className="workspace-heading"><p className="eyebrow">Workspace</p><h1>Account overview</h1><p>Manage your profile, your team and account access.</p></div>
    <div className="account-grid"><div className="account-panel"><ProfileForm key={user.version} user={user} /></div>
    {user.role === 'admin' && <div className="account-panel"><InvitationForm /></div>}</div>
    <section aria-labelledby="directory-heading" className="directory-panel grid gap-4">
      <h2 id="directory-heading" className="text-xl font-semibold">{user.role === 'admin' ? 'People and access' : 'Customer directory'}</h2>
      {message && <p role="alert">{message} <Link href="/" className="underline">First page</Link></p>}
      {directory && !directory.items.length && <p>No customers to display.</p>}
      <ul className="divide-y divide-current/20">{directory?.items.map(profile => <li key={`${profile.id}:${profile.version}`} className="grid gap-3 py-5 sm:grid-cols-2">
        <div><h3 className="font-medium">{profile.display_name || 'Unnamed account'}</h3><p className="text-sm opacity-75">{profile.role} · {profile.is_active ? 'Active' : 'Disabled'}</p><p className="break-all font-mono text-xs opacity-60">{profile.id}</p></div>
        {user.role === 'admin' && <AccessControls user={profile} />}
      </li>)}</ul>
      <nav aria-label="Directory pages" className="flex gap-6 text-sm underline">{cursor && <Link href="/">First page</Link>}{directory?.next_cursor && <Link href={`/?cursor=${encodeURIComponent(directory.next_cursor)}`} prefetch={false}>Next page</Link>}</nav>
    </section>
  </main></Shell>;
}
