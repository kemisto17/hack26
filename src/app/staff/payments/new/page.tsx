import { PaymentForm } from '@/components/staff-console/payment-form';
import { requireStaff } from '@/components/staff-console/session';
export default async function Page() { await requireStaff(); return <PaymentForm />; }
