import type { IconName } from '@/components/customer-web/icons';
export const navigation: { section: string; items: { slug: string; label: string; icon: IconName }[] }[] = [
  { section: 'Workspace', items: [
    { slug: 'dashboard', label: 'Overview', icon: 'grid' },
    { slug: 'customers', label: 'Customers', icon: 'user' },
    { slug: 'catalog', label: 'Products & plans', icon: 'layers' },
    { slug: 'quotations', label: 'Quotations', icon: 'document' },
    { slug: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
    { slug: 'invoices', label: 'Invoices', icon: 'document' },
    { slug: 'payments', label: 'Payments', icon: 'wallet' },
    { slug: 'reports', label: 'Reports', icon: 'chart' },
  ] },
  { section: 'Operations', items: [
    { slug: 'support', label: 'Support', icon: 'help' },
    { slug: 'notifications', label: 'Notifications', icon: 'bell' },
  ] },
  { section: 'Account', items: [
    { slug: 'profile', label: 'My profile', icon: 'user' },
    { slug: 'settings', label: 'Preferences', icon: 'settings' },
  ] },
];
export function currentSection(path: string) {
  return navigation.flatMap(group => group.items).find(item => path === `/staff/${item.slug}` || path.startsWith(`/staff/${item.slug}/`));
}
