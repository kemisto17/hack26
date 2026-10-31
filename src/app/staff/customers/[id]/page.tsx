import { CustomerDetail } from '@/components/staff-console/customers';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <CustomerDetail id={(await params).id} />; }
