import { notFound } from 'next/navigation';
import { listProducts, listPlans, listVariants, getProduct } from '@/modules/catalog/service';
import { AppError } from '@/lib/api/errors';
import { amount } from '@/components/customer-web/format';
import { requireStaff } from './session';
import { DataTable } from './table';
import { ButtonLink, Card, Heading, Notice, DetailGrid } from './ui';

export async function Catalog() {
  const actor = await requireStaff();
  const products = await listProducts(actor, { limit: 100 });
  return <><Heading title="Products & plans" description="Live product records from your catalog." /><Notice>Read-only catalog access. Showing up to 100 products; product and pricing changes belong to administrators.</Notice><DataTable title="Products" columns={['Product', 'Type', 'Price', 'Status']} rows={products.items.map(p => ({ id: p.id, href: `/staff/catalog/${p.id}`, status: p.is_active ? 'Active' : 'Retired', cells: [p.name, p.product_type, amount(p.sales_price_minor, p.currency), p.is_active ? 'Active' : 'Retired'] }))} statuses={['Active', 'Retired']} /></>;
}
export async function CatalogDetail({ id }: { id: string }) {
  const actor = await requireStaff();
  let product;
  try { product = await getProduct(actor, id); }
  catch (error) { if (error instanceof AppError && error.code === 'NOT_FOUND') notFound(); throw error; }
  const [plans, variants] = await Promise.all([listPlans(actor, { limit: 100 }), listVariants(actor, { limit: 100 })]);
  return <><Heading title={product.name} description="Current catalog product, variants and plans."><ButtonLink secondary href="/staff/catalog">Back to catalog</ButtonLink></Heading><Card title="Product overview"><DetailGrid items={[[ 'Type', product.product_type ], ['Price', amount(product.sales_price_minor, product.currency)], ['Status', product.is_active ? 'Active' : 'Retired']]} /></Card><Notice>Plans and variants below are filtered from the first 100 records in each category.</Notice><DataTable title="Available plans" columns={['Plan', 'Interval', 'Price', 'Status']} rows={plans.items.filter(p => p.product_id === id).map(p => ({id:p.id,status:p.is_active?'Active':'Retired',cells:[p.name,p.billing_interval,amount(p.price_minor,p.currency),p.is_active?'Active':'Retired']}))} /><DataTable title="Variants" columns={['Variant', 'Adjustment', 'Status']} rows={variants.items.filter(v => v.product_id === id).map(v => ({id:v.id,status:v.is_active?'Active':'Retired',cells:[v.name,amount(v.price_adjustment_minor,product.currency),v.is_active?'Active':'Retired']}))} /></>;
}
