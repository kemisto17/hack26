import { NewCustomerPage } from '@/components/admin-console/directory';
import { requireAdmin } from '@/components/admin-console/session';
export default async function Page() {
  await requireAdmin();
  return <NewCustomerPage />;
}
