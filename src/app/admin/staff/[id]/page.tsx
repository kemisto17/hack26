import { AccountDetail } from '@/components/admin-console/directory';
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cursor?: string }> }) {
  const { id } = await params;
  const { cursor } = await searchParams;
  return <AccountDetail id={id} kind="staff" cursor={cursor} />;
}
