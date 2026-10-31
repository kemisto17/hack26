import { DataTable } from '@/components/staff-console/table';
import { AdminHeading, ButtonLink, Card, Notice, Unavailable } from './ui';

export function AuditLogs() {
  return <><AdminHeading title="Audit logs" description="Read-only traceability for account, commercial and financial operations." />
    <Notice>The identity transport writes structured server logs, but there is no authorized audit-query service. Server log files and invitation ledgers are not exposed through this console.</Notice>
    <div className="admin-filter-boundary"><label>Actor<input disabled placeholder="Actor directory unavailable" /></label><label>Action<select disabled><option>All actions</option></select></label><label>Resource type<select disabled><option>All resources</option></select></label><label>From<input type="date" disabled /></label><label>Until<input type="date" disabled /></label></div>
    <DataTable title="Audit events" columns={['Timestamp', 'Actor', 'Action', 'Resource type', 'Resource ID', 'Result']} rows={[]} unavailable="A durable audit feed and safe metadata projection are not connected. No events have been inferred from mutable records." />
    <Card title="Expected coverage"><div className="admin-tag-list">{['Staff invitations', 'Role changes', 'Customer updates', 'Catalog changes', 'Quotation actions', 'Subscription lifecycle', 'Invoice actions', 'Payment recording', 'Security events'].map(label => <span key={label}>{label}</span>)}</div></Card>
  </>;
}

export function AdminNotifications() {
  return <><AdminHeading title="Notifications" description="Business-wide alerts and updates that need your attention." />
    <DataTable title="Notifications" columns={['Notification', 'Category', 'Resource', 'Created', 'Read status']} rows={[]} unavailable="No notification feed or read/unread persistence contract exists. No alerts have been fabricated." />
    <div className="staff-two-column"><Card title="Commercial activity"><Unavailable icon="bell">Subscription, quotation and payment alerts require an event feed.</Unavailable></Card><Card title="Security & operations"><Unavailable icon="shield">Staff access events and operational warnings require a verified notification source.</Unavailable></Card></div>
  </>;
}

export function SystemAvailability() {
  return <><AdminHeading title="System activity unavailable" description="Infrastructure visibility requires a reliable operational telemetry source."><ButtonLink secondary href="/admin/dashboard">Back to dashboard</ButtonLink></AdminHeading>
    <Card title="No health dashboard is connected"><Unavailable icon="chart">There is no durable billing-run history, job-health feed or operational-error service. The console cannot report uptime, last successful billing runs or failed jobs.</Unavailable></Card>
    <Notice>This page is an availability explanation, not a health dashboard. System Activity is omitted from navigation until reliable infrastructure information exists.</Notice>
  </>;
}

export function AdminSupport({ detail = false }: { detail?: boolean }) {
  if (detail) return <><AdminHeading title="Support request" description="Review the customer conversation and coordinate staff follow-up."><ButtonLink secondary href="/admin/support">All support requests</ButtonLink></AdminHeading>
    <div className="admin-editor-columns"><Card title="Conversation"><Unavailable title="Request unavailable">No support service is connected, so this request and its customer have not been verified.</Unavailable><form className="staff-form"><fieldset disabled><label>Internal note<textarea rows={4} disabled /></label><button type="button" className="staff-button" disabled>Save note unavailable</button></fieldset></form></Card>
      <Card title="Triage & assignment"><form className="staff-form"><fieldset disabled><label>Assigned staff<select disabled><option>Assignment unavailable</option></select></label><label>Priority<select disabled><option>Priority unavailable</option></select></label><label>Status<select disabled><option>Status unavailable</option></select></label><button type="button" className="staff-button secondary" disabled>Update request unavailable</button><button type="button" className="staff-button secondary" disabled>Escalation unavailable</button></fieldset></form></Card></div>
  </>;
  return <><AdminHeading title="Support management" description="A shared view of customer issues and the team’s response." />
    <Notice>Requests, staff assignment, priorities, escalation, conversations and internal notes require a support backend. No message delivery is simulated.</Notice>
    <DataTable title="Support requests" columns={['Subject', 'Customer', 'Assigned staff', 'Priority', 'Status', 'Created', 'Resolution']} rows={[]} unavailable="Support services and contracts have not been implemented." />
  </>;
}
