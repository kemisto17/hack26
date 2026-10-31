'use client';
import { useState } from 'react';
import { AdminHeading, Card, Notice, Unavailable } from './ui';

const groups = [
  { label: 'Financial', sections: ['Revenue & collections', 'Monthly recurring revenue', 'Outstanding balances', 'Collections by currency'] },
  { label: 'Customers', sections: ['Customer growth', 'Active customers', 'Retention'] },
  { label: 'Subscriptions', sections: ['New subscriptions', 'Renewals & closures', 'Churn trends'] },
  { label: 'Staff', sections: ['Customers handled', 'Quotation conversion', 'Operational workload'] },
];

export function AdminReports() {
  const [group, setGroup] = useState(0);
  const [message, setMessage] = useState('');
  return <><AdminHeading title="Analytics & reports" description="Business performance, without estimates disguised as financial facts." />
    <Notice>Billing summaries are not connected. MRR, churn, retention and comparison periods require complete historical datasets that are not currently exposed.</Notice>
    <form className="staff-report-filters" onSubmit={event => {
      event.preventDefault(); const values = new FormData(event.currentTarget);
      const from = String(values.get('from')); const to = String(values.get('to'));
      setMessage(to <= from ? 'Choose an end date after the start date.' : `Date range selected: ${from} to ${to} (exclusive, UTC). Report retrieval is unavailable.`);
    }}><label>From (UTC)<input type="date" name="from" required /></label><label>Until (exclusive, UTC)<input type="date" name="to" required /></label><button className="staff-button secondary">Review date range</button><p role="status">{message}</p></form>
    <div className="admin-report-categories" aria-label="Report categories">{groups.map((item, index) => <button key={item.label} className={group === index ? 'selected' : ''} aria-pressed={group === index} onClick={() => setGroup(index)}>{item.label}</button>)}</div>
    <div className="staff-two-column">{groups[group].sections.map(title => <Card key={title} title={title} description="Reporting integration pending"><Unavailable icon="chart" title="Report unavailable">There is no reliable dataset for this report yet. Charts, totals and export actions will appear after the owning service is connected.</Unavailable></Card>)}</div>
    {group === 0 && <Card title="Currency summary" description="Different currencies must never be added together."><div className="staff-table-scroll"><table><thead><tr>{['Currency', 'Billed', 'Collected', 'Outstanding', 'Overdue'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody /></table></div><Unavailable>Currency buckets require the authorized billing summary response.</Unavailable></Card>}
  </>;
}
