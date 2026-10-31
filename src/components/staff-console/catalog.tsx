import { DataTable } from './table';
import { ButtonLink, Card, Heading, Notice, Unavailable } from './ui';
export function Catalog() {
  return <><Heading title="Products & plans" description="Browse the products and recurring plans available for customer agreements." /><Notice>Read-only catalog access. Product creation and pricing changes belong to administrator workflows.</Notice><DataTable title="Products" columns={['Product', 'Type', 'Plans', 'Billing frequency', 'Price', 'Status']} rows={[]} statuses={['Active', 'Retired']} unavailable="The catalog service has not been integrated into this repository. Products, variants and prices cannot be loaded yet." /></>;
}
export function CatalogDetail() {
  return <><Heading title="Product details" description="Product information, variants and available plans."><ButtonLink secondary href="/staff/catalog">Back to catalog</ButtonLink></Heading><Card title="Product overview"><Unavailable title="Product unavailable">The catalog read service is not available. This product has not been verified.</Unavailable></Card><div className="staff-two-column"><Card title="Available plans"><Unavailable>Plan prices, billing frequency and eligibility require the catalog service.</Unavailable></Card><Card title="Variants & options"><Unavailable>Supported variants and adjustments will come from the catalog.</Unavailable></Card></div></>;
}
