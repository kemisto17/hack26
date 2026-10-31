import { AdminReports } from '@/components/admin-console/reports';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <AdminReports />;
}
