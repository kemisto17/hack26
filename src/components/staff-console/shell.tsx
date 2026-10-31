'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import type { UserDTO } from '@/modules/identity/contracts';
import { SignOut } from '@/modules/identity/sign-out';
import { BrandMark, Icon } from '@/components/customer-web/icons';
import { currentSection, navigation } from './navigation';

export function StaffShell({ user, children }: { user: UserDTO; children: ReactNode }) {
  const path = usePathname();
  const [mobile, setMobile] = useState(false);
  const [compact, setCompact] = useState(false);
  const section = currentSection(path);
  return <div className={`staff-console ${compact ? 'staff-compact' : ''}`}>
    <a className="staff-skip" href="#staff-content">Skip to content</a>
    {mobile && <button className="staff-backdrop" aria-label="Close navigation" onClick={() => setMobile(false)} />}
    <aside id="staff-navigation" className={`staff-sidebar ${mobile ? 'is-open' : ''}`} onKeyDown={e => { if (e.key === 'Escape') setMobile(false); }}>
      <Link className="staff-brand" href="/staff/dashboard" onClick={() => setMobile(false)}><BrandMark /><span>HACK26<small>OPERATIONS</small></span></Link>
      <button className="staff-mobile-close" aria-label="Close navigation" onClick={() => setMobile(false)}><Icon name="close" /></button>
      <div className="staff-workspace"><span className="staff-avatar">H</span><span>Business workspace<small>Staff console</small></span><Icon name="shield" size={16} /></div>
      <nav aria-label="Staff navigation">{navigation.map(group => <div className="staff-nav-group" key={group.section}><p>{group.section}</p>{group.items.map(item => <Link title={item.label} href={`/staff/${item.slug}`} key={item.slug} aria-current={section?.slug === item.slug ? 'page' : undefined} onClick={() => setMobile(false)}><Icon name={item.icon} size={18} /><span>{item.label}</span></Link>)}</div>)}</nav>
      <div className="staff-sidebar-bottom"><SignOut /><button className="staff-collapse" onClick={() => setCompact(!compact)} aria-label={compact ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!compact}><Icon name="menu" size={18} /><span>Collapse sidebar</span></button></div>
    </aside>
    <div className="staff-main"><header className="staff-topbar"><button className="staff-menu" aria-label="Open navigation" aria-expanded={mobile} aria-controls="staff-navigation" onClick={() => setMobile(true)}><Icon name="menu" /></button><nav aria-label="Breadcrumb"><Link href="/staff/dashboard">Workspace</Link><Icon name="chevron" size={13} /><span>{section?.label ?? 'Overview'}</span>{path.split('/').length > 3 && <><Icon name="chevron" size={13} /><span>{path.endsWith('/new') ? 'Create' : 'Detail'}</span></>}</nav><div className="staff-top-actions"><Link href="/staff/notifications" aria-label="Notifications"><Icon name="bell" size={19} /></Link><details className="staff-account"><summary><span className="staff-avatar">{user.display_name.slice(0, 1).toUpperCase() || 'S'}</span><span>{user.display_name}<small>{user.role === 'admin' ? 'Administrator' : 'Internal staff'}</small></span></summary><div><Link href="/staff/profile">My profile</Link><Link href="/staff/settings">Preferences</Link><SignOut /></div></details></div></header>
      <main id="staff-content" className="staff-content" tabIndex={-1}>{children}</main>
      <footer className="staff-footer"><span>HACK26 · Operations workspace</span><Link href="/staff/support">Help & support</Link></footer>
    </div>
  </div>;
}
