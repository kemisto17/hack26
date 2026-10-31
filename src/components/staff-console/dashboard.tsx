import Link from 'next/link';
import { Icon } from '@/components/customer-web/icons';
import { requireStaff } from './session';
import { ButtonLink, Card, Heading, Stat, Unavailable } from './ui';
export async function Dashboard() {
  const user = await requireStaff();
  return <><Heading title={`Welcome back, ${user.display_name.split(' ')[0] || 'there'}`} description="Your customer operations, in one place."><ButtonLink secondary href="/staff/customers">View customers</ButtonLink><ButtonLink href="/staff/quotations/new">Create quotation</ButtonLink></Heading>
    <div className="staff-overview-banner"><div><span className="staff-tag">OPERATIONS OVERVIEW</span><h2>Keep every agreement moving.</h2><p>Start with a customer, prepare their terms, and follow through to collection.</p></div><Icon name="repeat" size={56} /></div>
    <div className="staff-stats">{([{ title: 'Assigned customers', icon: 'user' }, { title: 'Active subscriptions', icon: 'repeat' }, { title: 'Pending quotations', icon: 'document' }, { title: 'Outstanding invoices', icon: 'clock' }, { title: 'Payments collected', icon: 'wallet' }] as const).map(item => <Stat key={item.title} {...item} />)}</div>
    <div className="staff-two-column">{[
      ['Quotations awaiting action', 'Review drafts and terms ready for confirmation.', '/staff/quotations'],
      ['Subscriptions to review', 'Activation and lifecycle work awaiting your attention.', '/staff/subscriptions'],
      ['Upcoming invoice due dates', 'Stay ahead of the next collection date.', '/staff/invoices'],
      ['Overdue invoices', 'Prioritize outstanding customer balances.', '/staff/invoices'],
      ['Recent customer activity', 'A timeline of your customer relationships.', '/staff/customers'],
      ['Recent payments', 'Verified receipts across customer invoices.', '/staff/payments'],
    ].map(([title, description, href]) => <Card key={title} title={title} description={description} action={<Link className="staff-text-link" href={href}>View all →</Link>}><Unavailable title="Activity not connected">This summary requires authorized operational data. No business totals or activity have been estimated.</Unavailable></Card>)}</div>
    <Card title="Notifications" action={<Link className="staff-text-link" href="/staff/notifications">Open notifications →</Link>}><Unavailable icon="bell">Your notification feed is not available yet.</Unavailable></Card>
    <div className="staff-quick-links"><ButtonLink secondary href="/staff/subscriptions">View subscriptions</ButtonLink><ButtonLink secondary href="/staff/payments/new">Record payment</ButtonLink><span>Customer creation is not enabled for staff.</span></div>
  </>;
}
