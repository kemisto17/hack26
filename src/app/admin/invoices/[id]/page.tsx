import { AdminInvoiceDetail } from '@/components/admin-console/record-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <AdminInvoiceDetail id={(await params).id} />;
}
