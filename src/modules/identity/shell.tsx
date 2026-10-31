import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppError } from '@/lib/api/errors';
import { getMe, requireActor } from './service';
import type { UserDTO } from './contracts';
import { SignOut } from './sign-out';

export async function pageUser() {
  try { return await getMe(await requireActor()); }
  catch (error) {
    if (error instanceof AppError && ['UNAUTHENTICATED', 'FORBIDDEN'].includes(error.code)) redirect('/login?reason=account');
    throw error;
  }
}
export function Shell({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  const portal = user.role === 'customer';
  const links = portal ? [['Overview', '/portal'], ['Catalog', '/portal/catalog'], ['Subscriptions', '/portal/subscriptions'], ['Invoices', '/portal/invoices'], ['Payments', '/portal/payments']] : [['Overview', '/'], ['Catalog', '/catalog'], ['Quotes', '/quotation-templates'], ['Subscriptions', '/subscriptions'], ['Invoices', '/invoices'], ['Payments', '/payments'], ['Reports', '/reports']];
  return <div className="mx-auto w-full max-w-7xl flex-1 px-5 sm:px-8">
    <a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-current/20 py-6">
      <Link href={portal ? '/portal' : '/'} className="font-semibold tracking-widest">BRIGHTLOOP</Link>
      <div className="flex items-center gap-5 text-sm"><span>{user.display_name || 'Your account'} · {user.role}</span><SignOut /></div>
    </header>
    <nav aria-label="Main navigation" className="flex flex-wrap gap-x-6 gap-y-3 border-b border-current/20 py-4 text-sm">{links.map(([label, href]) => <Link key={href} href={href} prefetch={false} className="underline-offset-4 hover:underline">{label}</Link>)}</nav>
    {children}
  </div>;
}
