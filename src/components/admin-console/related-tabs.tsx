'use client';
import { useId, useState } from 'react';
import { Card, Unavailable } from './ui';

export function RelatedTabs({ kind }: { kind: 'customer' | 'staff' }) {
  const tabs = kind === 'customer' ? ['Overview', 'Subscriptions', 'Quotations', 'Invoices', 'Payments', 'Activity'] : ['Workload', 'Assigned customers', 'Activity'];
  const [selected, setSelected] = useState(0);
  const id = useId();
  return <div>
    <div role="tablist" aria-label="Related account records" className="staff-tabs">
      {tabs.map((tab, index) => <button key={tab} id={`${id}-${index}`} role="tab" aria-selected={selected === index} aria-controls={`${id}-panel`} tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined;
        if (next !== undefined) { event.preventDefault(); setSelected(next); document.getElementById(`${id}-${next}`)?.focus(); }
      }}>{tab}</button>)}
    </div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${selected}`} tabIndex={0}><Card title={tabs[selected]}><Unavailable title={`${tabs[selected]} not connected`}>The account service does not return this information. Related financial records, assignments and activity require their owning services.</Unavailable></Card></div>
  </div>;
}
