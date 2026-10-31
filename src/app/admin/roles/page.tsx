import { RolesPage } from '@/components/admin-console/permissions';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <RolesPage />;
}
