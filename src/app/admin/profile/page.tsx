import { AdminProfile } from '@/components/admin-console/settings';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <AdminProfile />;
}
