import { SystemAvailability } from '@/components/admin-console/monitoring';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <SystemAvailability />;
}
