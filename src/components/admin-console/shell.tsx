'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { UserDTO } from '@/modules/identity/contracts';
import { SignOut } from '@/modules/identity/sign-out';
import { BrandMark, Icon } from '@/components/customer-web/icons';
import { activeAdminItem, adminNavigation } from './navigation';

export function AdminShell({ user, children }: { user: UserDTO; children: ReactNode }) {
  const pathname = usePathname();
  const active = activeAdminItem(pathname);
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return <div className={`staff-console admin-console ${collapsed ? 'admin-collapsed' : ''}`}>
    <a className="staff-skip" href="#admin-content">Skip to content</a>
    {mobile && <button className="admin-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside id="admin-navigation" className={`admin-sidebar ${mobile ? 'is-open' : ''}`} onKeyDown={event => { if (event.key === 'Escape') setMobile(false); }}>
      <Link href="/admin/dashboard" className="admin-brand" onClick={() => setMobile(false)}><BrandMark /><span>HACK26<small>ADMINISTRATION</small></span></Link>
      <button className="admin-close" aria-label="Close navigation" onClick={() => setMobile(false)}><Icon name="close" /></button>
      <div className="admin-workspace"><Icon name="shield" /><span>Business control centre<small>Administrator workspace</small></span></div>
      <nav aria-label="Administrator navigation">
        {adminNavigation.map(group => <details open key={group.label} className="admin-nav-group">
          <summary>{group.label}<Icon name="chevron" size={12} /></summary>
          {group.items.map(item => <Link key={item.path} href={`/admin/${item.path}`} title={item.label} aria-current={active?.path === item.path ? 'page' : undefined} onClick={() => setMobile(false)}><Icon name={item.icon} size={17} /><span>{item.label}</span></Link>)}
        </details>)}
      </nav>
      <div className="admin-sidebar-bottom"><SignOut /><button className="admin-collapse" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed}><Icon name="menu" size={16} /><span>Collapse navigation</span></button></div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <button className="admin-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="admin-navigation" onClick={() => setMobile(true)}><Icon name="menu" /></button>
        <nav aria-label="Breadcrumb"><Link href="/admin/dashboard">Administration</Link><Icon name="chevron" size={13} /><span>{active?.label ?? 'Overview'}</span></nav>
        <div className="admin-top-actions"><span className="admin-access-label"><Icon name="shield" size={13} />Admin access</span><Link href="/admin/notifications" aria-label="Notifications"><Icon name="bell" size={18} /></Link>
          <details className="admin-profile-menu"><summary><span className="admin-avatar">{user.display_name.slice(0, 1).toUpperCase() || 'A'}</span><span>{user.display_name}<small>Administrator</small></span></summary><div><Link href="/admin/profile">My profile</Link><Link href="/admin/settings/security">Security</Link><Link href="/staff/dashboard">Staff workspace</Link><SignOut /></div></details>
        </div>
      </header>
      <main id="admin-content" className="admin-content" tabIndex={-1}>{children}</main>
      <footer className="admin-footer"><span>HACK26 / Administration</span><Link href="/admin/settings/security">Access & security</Link></footer>
    </div>
  </div>;
}
