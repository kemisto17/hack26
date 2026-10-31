import 'server-only';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AppError } from '@/lib/api/errors';
import { getMe, requireActor } from './service';
import type { UserDTO } from './contracts';
import { SignOut } from './sign-out';
import { Brand } from '@/components/customer-web/public-shell';
import { WorkspaceNavigation } from './workspace-navigation';

export async function pageUser() {
  try { return await getMe(await requireActor()); }
  catch (error) {
    if (error instanceof AppError && ['UNAUTHENTICATED', 'FORBIDDEN'].includes(error.code)) redirect('/login?reason=account');
    throw error;
  }
}
export function Shell({ user, children }: { user: UserDTO; children: React.ReactNode }) {
  const portal = user.role === 'customer';
  return <div className="portal-app identity-app">
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="portal-sidebar identity-sidebar">
      <Brand href={portal ? '/portal' : '/'} />
      <p className="sidebar-caption">{portal ? 'CUSTOMER WORKSPACE' : 'BUSINESS WORKSPACE'}</p>
      <WorkspaceNavigation portal={portal} />
      <div className="sidebar-bottom"><div className="sidebar-profile">
        <span className="avatar">{user.display_name.slice(0, 1).toUpperCase() || 'B'}</span>
        <div><strong>{user.display_name || 'Your account'}</strong><span>{user.role === 'admin' ? 'Administrator' : user.role === 'internal' ? 'Internal staff' : 'Customer'}</span></div>
      </div></div>
    </aside>
    <div className="portal-body">
      <header className="portal-topbar"><div className="breadcrumbs"><span>Brightloop</span><strong>{portal ? 'Your account' : 'Business workspace'}</strong></div><SignOut /></header>
      <div className="portal-main identity-main">{children}<footer className="portal-footer"><span>Brightloop workspace</span><Link href={portal ? '/portal' : '/'}>Account overview</Link></footer></div>
    </div>
  </div>;
}
