import Link from 'next/link';
import { Icon } from '@/components/customer-web/icons';
import { adminDirectory } from './session';
import { AdminHeading, ButtonLink, Card, Metric, Unavailable } from './ui';

export async function AdminDashboard() {
  const accounts = await adminDirectory('users');
  const complete = accounts.next_cursor === null;
  const customers = complete ? accounts.items.filter(user => user.role === 'customer').length : null;
  const staff = complete ? accounts.items.filter(user => user.role !== 'customer').length : null;
  return <>
    <AdminHeading title="Business overview" description="A clear view of your customers, team and commercial operations."><ButtonLink secondary href="/admin/reports">Explore reports</ButtonLink><ButtonLink href="/admin/staff/invite">Invite staff</ButtonLink></AdminHeading>
    <div className="admin-overview-strip"><div><span className="admin-label">YOUR BUSINESS, CONNECTED</span><h2>From the first agreement to the final receipt.</h2><p>Manage your team today. Commercial workflows will appear here as their services become available.</p></div><Icon name="layers" size={44} /></div>
    <div className="admin-metrics">
      <Metric label="Total customers" icon="user" value={customers} description={complete ? 'Verified account directory' : 'Full count not available'} />
      <Metric label="Total staff" icon="shield" value={staff} description={complete ? 'Includes administrators' : 'Full count not available'} />
      <Metric label="Active subscriptions" icon="repeat" />
      <Metric label="Monthly recurring revenue" icon="chart" />
      <Metric label="Revenue collected" icon="wallet" />
      <Metric label="Outstanding invoices" icon="document" />
      <Metric label="Pending quotations" icon="clock" />
      <Metric label="Overdue payments" icon="wallet" />
    </div>
    <div className="admin-overview-grid">
      <Card title="Revenue & collections" description="Billed, collected and outstanding, separated by currency." action={<Link className="staff-text-link" href="/admin/reports">Reports →</Link>}><Unavailable icon="chart" title="Revenue trends not connected">No reliable time-series or recurring-revenue data is available. A chart will appear when reporting is connected.</Unavailable></Card>
      <Card title="Recent account registrations" description="Actual profile creation dates; this is not an activity audit." action={<Link className="staff-text-link" href="/admin/staff">Directory →</Link>}>
        <div className="admin-recent-accounts">{accounts.items.slice(0, 5).map(user => <div key={user.id}><span className="admin-avatar">{user.display_name.slice(0, 1).toUpperCase() || '?'}</span><div><strong>{user.display_name || 'Unnamed account'}</strong><small>{user.role === 'internal' ? 'Internal staff' : user.role}</small></div><time dateTime={user.created_at}>{user.created_at.slice(0, 10)}</time></div>)}{accounts.items.length === 0 && <p>No registered accounts were returned.</p>}</div>
      </Card>
    </div>
    <div className="staff-two-column">{[
      ['Customer & subscription growth', 'Growth and retention need complete historical datasets.', 'user'],
      ['Subscription status breakdown', 'Active, paused and closed agreements need subscription reads.', 'repeat'],
      ['Outstanding balances', 'Authoritative balances and collection trends need billing reads.', 'wallet'],
      ['Upcoming renewals', 'Renewal schedules need connected subscription records.', 'clock'],
      ['Business & staff activity', 'Attribution and event history are not exposed by current services.', 'layers'],
      ['Alerts requiring attention', 'No reliable operational alert feed is connected.', 'bell'],
    ].map(([title, description, icon]) => <Card key={title} title={title}><Unavailable icon={icon as 'user' | 'repeat' | 'wallet' | 'clock' | 'layers' | 'bell'}>{description}</Unavailable></Card>)}</div>
    <Card title="Quick actions"><div className="admin-quick-actions"><ButtonLink secondary href="/admin/catalog/new">Product setup</ButtonLink><ButtonLink secondary href="/admin/pricing">Pricing configuration</ButtonLink><ButtonLink secondary href="/admin/quotations">View quotations</ButtonLink><ButtonLink secondary href="/admin/invoices">Review invoices</ButtonLink></div></Card>
  </>;
}
