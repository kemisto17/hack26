import { Dashboard } from '@/components/staff-console/dashboard';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <Dashboard />; }
