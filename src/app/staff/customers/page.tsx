import { Customers } from '@/components/staff-console/customers';
export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) { const { cursor } = await searchParams; return <Customers cursor={cursor} />; }
