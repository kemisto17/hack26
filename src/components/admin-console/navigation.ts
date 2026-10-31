import type { IconName } from '@/components/customer-web/icons';

type Item = { path: string; label: string; icon: IconName };
export const adminNavigation: { label: string; items: Item[] }[] = [
  { label: 'Overview', items: [
    { path: 'dashboard', label: 'Dashboard', icon: 'grid' },
    { path: 'reports', label: 'Analytics & reports', icon: 'chart' },
  ] },
  { label: 'Business management', items: [
    { path: 'customers', label: 'Customers', icon: 'user' },
    { path: 'staff', label: 'Staff & roles', icon: 'shield' },
    { path: 'catalog', label: 'Products & plans', icon: 'layers' },
    { path: 'pricing', label: 'Pricing & discounts', icon: 'wallet' },
  ] },
  { label: 'Operations', items: [
    { path: 'quotations', label: 'Quotations', icon: 'document' },
    { path: 'subscriptions', label: 'Subscriptions', icon: 'repeat' },
    { path: 'invoices', label: 'Invoices', icon: 'document' },
    { path: 'payments', label: 'Payments', icon: 'wallet' },
    { path: 'support', label: 'Support', icon: 'help' },
  ] },
  { label: 'Monitoring', items: [
    { path: 'audit-logs', label: 'Audit logs', icon: 'clock' },
    { path: 'notifications', label: 'Notifications', icon: 'bell' },
  ] },
  { label: 'Configuration', items: [
    { path: 'settings/business', label: 'Business profile', icon: 'layers' },
    { path: 'settings/billing', label: 'Billing settings', icon: 'document' },
    { path: 'settings/tax', label: 'Tax settings', icon: 'wallet' },
    { path: 'settings/security', label: 'Security & permissions', icon: 'shield' },
    { path: 'settings', label: 'General settings', icon: 'settings' },
  ] },
  { label: 'Account', items: [{ path: 'profile', label: 'My profile', icon: 'user' }] },
];

export function activeAdminItem(pathname: string) {
  if (pathname === '/admin/roles') return { path: 'staff', label: 'Roles & permissions', icon: 'shield' as const };
  return adminNavigation.flatMap(group => group.items)
    .filter(item => pathname === `/admin/${item.path}` || pathname.startsWith(`/admin/${item.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
