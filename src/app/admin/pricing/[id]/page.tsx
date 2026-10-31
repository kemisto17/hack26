import { notFound } from 'next/navigation';
import { validResourceId } from '@/components/customer-web/format';
import { requireAdmin } from '@/components/admin-console/session';
import { PricingPage } from '@/components/admin-console/catalog';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  if (!validResourceId((await params).id)) notFound();
  return <PricingPage detail />;
}
