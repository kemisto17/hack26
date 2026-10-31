import { AdminCatalog } from '@/components/admin-console/catalog';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <AdminCatalog />;
}
