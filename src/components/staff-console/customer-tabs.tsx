'use client';
import { useState } from 'react';
import { Card, Unavailable } from './ui';
const tabs = ['Overview', 'Subscriptions', 'Quotations', 'Invoices', 'Payments', 'Activity'];
export function CustomerTabs({ customerId }: { customerId: string }) {
  const [selected, setSelected] = useState(0);
  return <div className="staff-tabs-wrap"><div role="tablist" aria-label="Customer records" className="staff-tabs">{tabs.map((tab, index) => <button key={tab} id={`customer-tab-${index}`} role="tab" aria-selected={selected === index} aria-controls="customer-tab-panel" tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)} onKeyDown={e => {
    const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : undefined;
    if (next !== undefined) { e.preventDefault(); setSelected(next); document.getElementById(`customer-tab-${next}`)?.focus(); }
  }}>{tab}</button>)}</div><div role="tabpanel" id="customer-tab-panel" aria-labelledby={`customer-tab-${selected}`} tabIndex={0}><Card title={tabs[selected]} description={`Customer ${customerId}`}><Unavailable title={`${tabs[selected]} not connected`}>Related records and activity will appear when authorized customer-scoped reads are connected. No records or balances have been inferred from the directory.</Unavailable></Card></div></div>;
}
