import type { ReactNode } from 'react';
import { Icon, type IconName } from '@/components/customer-web/icons';
export { Card, Notice, Unavailable, ButtonLink, DetailGrid } from '@/components/staff-console/ui';

export function AdminHeading({ title, description, children }: { title: string; description: string; children?: ReactNode }) {
  return <header className="staff-heading"><div><p className="staff-eyebrow">ADMINISTRATION / BUSINESS WORKSPACE</p><h1>{title}</h1><p>{description}</p></div><div className="staff-heading-actions">{children}</div></header>;
}

export function Metric({ label, icon, value = null, description = 'Data not connected' }: { label: string; icon: IconName; value?: number | null; description?: string }) {
  return <div className="admin-metric"><div><span>{label}</span><Icon name={icon} size={17} /></div><strong aria-label={value === null ? 'Unavailable' : undefined}>{value === null ? '—' : value.toLocaleString('en-US')}</strong><small>{description}</small></div>;
}

export function SettingField({ label, type = 'text', hint }: { label: string; type?: string; hint?: string }) {
  return <label>{label}<input type={type} disabled placeholder={hint ?? 'Not configured'} /></label>;
}
