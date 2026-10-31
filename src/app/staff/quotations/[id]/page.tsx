import { SubscriptionDetail } from '@/components/staff-console/details';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <SubscriptionDetail id={(await params).id} quotation />; }
