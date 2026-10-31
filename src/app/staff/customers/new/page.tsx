import { NewCustomer } from '@/components/staff-console/customers';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <NewCustomer />; }
