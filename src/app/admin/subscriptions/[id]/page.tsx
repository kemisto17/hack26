import { AdminSubscriptionDetail } from '@/components/admin-console/record-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminSubscriptionDetail id={(await params).id} />;
}
