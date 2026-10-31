import { AdminDashboard } from '@/components/admin-console/dashboard';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <AdminDashboard />;
}
