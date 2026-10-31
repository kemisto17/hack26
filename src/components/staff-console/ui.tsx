import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/customer-web/icons';

export function Heading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="staff-heading"><div><p className="staff-eyebrow">WORKSPACE / OPERATIONS</p><h1>{title}</h1><p>{description}</p></div><div className="staff-heading-actions">{children}</div></header>;
}
export function Card({ title, description, children, action }: { title: string; description?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="staff-card"><header><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</header>{children}</section>;
}
export function Unavailable({ title = 'Not connected yet', children, icon = 'layers' }: { title?: string; children: ReactNode; icon?: IconName }) {
  return <div className="staff-unavailable" role="status"><span><Icon name={icon} size={24} /></span><h3>{title}</h3><p>{children}</p><span className="staff-tag">Integration pending</span></div>;
}
export function Notice({ children }: { children: ReactNode }) { return <div className="staff-notice"><Icon name="help" size={18} /><p>{children}</p></div>; }
export function ButtonLink({ href, children, secondary = false }: { href: string; children: ReactNode; secondary?: boolean }) { return <Link className={`staff-button ${secondary ? 'secondary' : ''}`} href={href}>{children}</Link>; }
export function Stat({ title, icon }: { title: string; icon: IconName }) { return <div className="staff-stat"><div><span>{title}</span><Icon name={icon} size={18} /></div><strong aria-label="Unavailable">—</strong><small>Not connected</small></div>; }
export function DetailGrid({ items }: { items: [string, ReactNode][] }) { return <dl className="staff-detail-grid">{items.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>; }
