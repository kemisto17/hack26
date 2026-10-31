import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AppError } from '@/lib/api/errors';
import { getBillingContact } from '@/modules/identity/service';
import { validResourceId, date } from '@/components/customer-web/format';
import { adminDirectory, requireAdmin } from './session';
import { AdminHeading, ButtonLink, Card, DetailGrid, Notice, Unavailable } from './ui';
import { DirectoryTable } from './directory-table';
import { RelatedTabs } from './related-tabs';
import { AccessEditor } from './access-editor';
import { AdminInviteForm } from './invite-form';

export async function Directory({ kind, cursor }: { kind: 'customers' | 'staff'; cursor?: string }) {
  const result = await adminDirectory(kind === 'customers' ? 'customers' : 'users', cursor);
  return <>
    <AdminHeading title={kind === 'customers' ? 'Customers' : 'Staff & roles'} description={kind === 'customers' ? 'Customer relationships, account status and access in one place.' : 'Manage the people who operate your business.'}>
      {kind === 'staff' ? <><ButtonLink secondary href="/admin/roles">View permissions</ButtonLink><ButtonLink href="/admin/staff/invite">Invite staff</ButtonLink></> : <ButtonLink secondary href="/admin/customers/new">Account creation options</ButtonLink>}
    </AdminHeading>
    <Notice>The directory supplies names, roles and account status. Email, phone, workload, subscription counts and balances are not included. Search and sorting apply to the current batch of up to 100 accounts.</Notice>
    {cursor && <Link className="staff-text-link" href={`/admin/${kind}`}>← Return to newest accounts</Link>}
    <DirectoryTable items={result.items} kind={kind} cursor={cursor} nextCursor={result.next_cursor} />
  </>;
}

export async function AccountDetail({ id, kind, cursor }: { id: string; kind: 'customers' | 'staff'; cursor?: string }) {
  const admin = await requireAdmin();
  if (!validResourceId(id)) notFound();
  const directory = await adminDirectory(kind === 'customers' ? 'customers' : 'users', cursor);
  const user = directory.items.find(item => item.id === id && (kind === 'customers' ? item.role === 'customer' : item.role !== 'customer'));
  if (!user) return <>
    <AdminHeading title="Account unavailable in this batch" description="Open the account from its current directory page to retrieve a verified profile."><ButtonLink href={`/admin/${kind}`}>Open directory</ButtonLink></AdminHeading>
    <Notice>A single-account identity read is not available. Directory links preserve their cursor; this record may have moved, changed role or may not exist.</Notice>
  </>;
  let email = 'Not exposed by the staff profile contract';
  if (kind === 'customers') {
    try { email = (await getBillingContact({ id: admin.id, role: admin.role }, id)).email; }
    catch (error) { if (!(error instanceof AppError && error.code === 'NOT_FOUND')) throw error; email = 'Contact unavailable'; }
  }
  return <>
    <AdminHeading title={user.display_name || 'Unnamed account'} description={`${kind === 'staff' ? 'Team member' : 'Customer'} · ${user.is_active ? 'Active account' : 'Inactive account'}`}><ButtonLink secondary href={`/admin/${kind}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`}>Back to directory</ButtonLink></AdminHeading>
    <div className="admin-detail-columns">
      <Card title="Account information"><DetailGrid items={[
        ['Account ID', user.id], ['Name', user.display_name], ['Role', user.role], ['Status', user.is_active ? 'Active' : 'Inactive'], ['Email', email], ['Phone', 'Not supported'], ['Registered', date(user.created_at)], ['Last profile update', date(user.updated_at)],
      ]} /></Card>
      <Card title="Access management" description="Changes are verified and saved by the identity service."><AccessEditor key={user.version} user={user} currentAdminId={admin.id} /></Card>
    </div>
    <RelatedTabs kind={kind === 'customers' ? 'customer' : 'staff'} />
  </>;
}

export function InviteStaffPage() {
  return <><AdminHeading title="Invite a team member" description="Give a colleague access to the staff operations workspace."><ButtonLink secondary href="/admin/staff">Back to staff</ButtonLink></AdminHeading>
    <div className="admin-editor-columns"><Card title="Invitation details" description="A real invitation will be sent after your confirmation."><AdminInviteForm /></Card>
      <Card title="How invitations work"><div className="staff-card-padding admin-explainer"><span className="admin-step">01</span><h3>Invite by email</h3><p>The identity service verifies your active administrator role.</p><span className="admin-step">02</span><h3>Set up an account</h3><p>The recipient opens their invitation and chooses a password.</p><span className="admin-step">03</span><h3>Review access</h3><p>The account becomes internal staff. Additional role changes require a separate review.</p></div></Card>
    </div></>;
}

export function NewCustomerPage() {
  return <><AdminHeading title="Customer account creation" description="Customer identities are managed through verified signup."><ButtonLink secondary href="/admin/customers">Back to customers</ButtonLink></AdminHeading>
    <div className="staff-two-column"><Card title="New customer"><form className="staff-form"><fieldset disabled><label>Display name<input maxLength={200} /></label><label>Email<input type="email" maxLength={254} /></label><p>Phone numbers are not supported by the current profile contract.</p><button type="button" className="staff-button" disabled>Create customer unavailable</button></fieldset></form></Card>
      <Card title="Existing account workflow"><Unavailable title="Administrator creation not connected">The identity service supports public customer signup and staff invitations. There is no administrator customer-creation or contact-edit endpoint.</Unavailable><div className="staff-card-padding"><ButtonLink secondary href="/signup">Open customer signup</ButtonLink></div></Card></div>
  </>;
}
