'use client';
import { useState } from 'react';
import type { UserDTO } from '@/modules/identity/contracts';
import { DataTable } from '@/components/staff-console/table';

export function DirectoryTable({ items, kind, cursor, nextCursor }: {
  items: UserDTO[]; kind: 'customers' | 'staff'; cursor?: string; nextCursor: string | null;
}) {
  const [role, setRole] = useState('all');
  const rows = items.filter(user => kind === 'customers' ? user.role === 'customer' : user.role !== 'customer')
    .filter(user => role === 'all' || user.role === role);
  return <>
    {kind === 'staff' && <div className="admin-directory-options"><label>Account role<select value={role} onChange={event => setRole(event.target.value)}><option value="all">All staff roles</option><option value="internal">Internal staff</option><option value="admin">Administrators</option></select></label><span>Staff in the current account batch. Older accounts are on the next batch.</span></div>}
    <DataTable key={role} title={kind === 'staff' ? 'Staff accounts' : 'Customers'}
      columns={['Name', 'Account ID', 'Role', 'Status', 'Registered']}
      statuses={['Active', 'Inactive']}
      rows={rows.map(user => ({ id: user.id, status: user.is_active ? 'Active' : 'Inactive',
        href: `/admin/${kind}/${user.id}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        cells: [user.display_name || 'Unnamed account', user.id, user.role === 'internal' ? 'Internal staff' : user.role === 'admin' ? 'Administrator' : 'Customer', user.is_active ? 'Active' : 'Inactive', user.created_at.slice(0, 10)],
      }))}
      nextHref={nextCursor ? `/admin/${kind}?cursor=${encodeURIComponent(nextCursor)}` : undefined}
    />
  </>;
}
