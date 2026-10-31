import { InvoiceDetail } from '@/components/staff-console/details';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <InvoiceDetail id={(await params).id} />; }
