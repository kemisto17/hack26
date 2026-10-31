import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBillingContact } from '@/modules/identity/service';
import { AppError } from '@/lib/api/errors';
import { validResourceId } from '@/components/customer-web/format';
import { customerDirectory, requireStaff } from './session';
import { DataTable } from './table';
import { ButtonLink, Card, DetailGrid, Heading, Notice, Unavailable } from './ui';
import { CustomerTabs } from './customer-tabs';

export async function Customers({ cursor }: { cursor?: string }) {
  const result = await customerDirectory(cursor);
  return <><Heading title="Customers" description="The people behind your subscriptions. Find a customer and open their workspace." />
    <Notice>Your verified role can read the customer directory. Customer creation and editing are not available in the current identity service. Email, phone, assignments and balances are not included in directory results.</Notice>
    <DataTable title="Customers" columns={['Customer', 'Customer ID', 'Status', 'Joined']} statuses={['Active', 'Inactive']} rows={result.items.map(customer => ({ id: customer.id, href: `/staff/customers/${customer.id}`, status: customer.is_active ? 'Active' : 'Inactive', cells: [customer.display_name, customer.id, customer.is_active ? 'Active' : 'Inactive', customer.created_at.slice(0, 10)] }))} nextHref={result.next_cursor ? `/staff/customers?cursor=${encodeURIComponent(result.next_cursor)}` : undefined} />
    <p className="staff-footnote">Search, filters and sorting apply to the loaded batch of up to 50 customers. Use “Load next batch” for older records.</p></>;
}
export async function CustomerDetail({ id }: { id: string }) {
  const user = await requireStaff();
  if (!validResourceId(id)) notFound();
  let contact;
  try { contact = await getBillingContact({ id: user.id, role: user.role }, id); }
  catch (error) { if (error instanceof AppError && error.code === 'NOT_FOUND') notFound(); throw error; }
  return <><Heading title={contact.display_name} description="Customer workspace" ><ButtonLink secondary href="/staff/customers">All customers</ButtonLink></Heading>
    <Card title="Contact information" description="Verified through the identity service."><DetailGrid items={[
      ['Customer ID', id], ['Email', <Link key="email" href={`mailto:${contact.email}`}>{contact.email}</Link>], ['Phone', 'Not provided by the profile contract'], ['Account status', 'Not included in this contact response'], ['Assigned staff', 'Assignments are not supported'],
    ]} /></Card><CustomerTabs customerId={id} /></>;
}
export function NewCustomer() {
  return <><Heading title="Add customer" description="Customer accounts are created through verified signup." ><ButtonLink secondary href="/staff/customers">Back to customers</ButtonLink></Heading>
    <div className="staff-two-column"><Card title="Customer information" description="Staff-created accounts are not supported yet."><form className="staff-form"><fieldset disabled><label>Name<input placeholder="Customer display name" maxLength={200} /></label><label>Email<input type="email" placeholder="customer@company.com" /></label><p>Phone numbers are not part of the current customer profile.</p><button className="staff-button" type="button" disabled>Create customer unavailable</button></fieldset></form></Card><Card title="Account creation"><Unavailable icon="shield" title="Verified signup required">The identity service does not expose staff customer creation. Ask the customer to use the public signup page; no password or account is created here.</Unavailable><div className="staff-card-padding"><ButtonLink secondary href="/signup">Open signup page</ButtonLink></div></Card></div></>;
}
