import { Profile } from '@/components/staff-console/account';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <Profile />; }
