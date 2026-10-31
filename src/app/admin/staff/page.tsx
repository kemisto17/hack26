import { Directory } from '@/components/admin-console/directory';
export default async function Page({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const { cursor } = await searchParams;
  return <Directory kind="staff" cursor={cursor} />;
}
