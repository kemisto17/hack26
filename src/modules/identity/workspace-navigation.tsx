'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon, type IconName } from '@/components/customer-web/icons';

const staffLinks: [string, string, IconName][] = [
  ['Overview', '/', 'grid'], ['Catalog', '/catalog', 'layers'],
  ['Quotes', '/quotation-templates', 'document'], ['Subscriptions', '/subscriptions', 'repeat'],
  ['Invoices', '/invoices', 'document'], ['Payments', '/payments', 'wallet'], ['Reports', '/reports', 'chart'],
];
const customerLinks: [string, string, IconName][] = [
  ['Overview', '/portal', 'grid'], ['Catalog', '/portal/catalog', 'layers'],
  ['Subscriptions', '/portal/subscriptions', 'repeat'], ['Invoices', '/portal/invoices', 'document'],
  ['Payments', '/portal/payments', 'wallet'],
];

export function WorkspaceNavigation({ portal }: { portal: boolean }) {
  const pathname = usePathname();
  return <nav aria-label={portal ? 'Customer navigation' : 'Staff navigation'}>
    {(portal ? customerLinks : staffLinks).map(([label, href, icon]) => {
      const active = pathname === href || (href !== '/' && href !== '/portal' && pathname.startsWith(`${href}/`));
      return <Link key={href} href={href} prefetch={false} aria-current={active ? 'page' : undefined} className={active ? 'active' : undefined}>
        <Icon name={icon} size={18} /><span>{label}</span>
      </Link>;
    })}
  </nav>;
}
