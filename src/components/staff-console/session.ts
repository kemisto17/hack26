import 'server-only';
import { redirect } from 'next/navigation';
import { getMe, requireActor, listCustomers } from '@/modules/identity/service';
import { AppError } from '@/lib/api/errors';

/** D1 verifies the session and current database role on every request. */
export async function requireStaff() {
  try {
    const user = await getMe(await requireActor());
    if (user.role === 'customer') redirect('/portal/dashboard');
    return user;
  } catch (error) {
    if (error instanceof AppError && ['UNAUTHENTICATED', 'FORBIDDEN'].includes(error.code)) redirect('/login?reason=account');
    throw error;
  }
}

export async function customerDirectory(cursor?: string) {
  const user = await requireStaff();
  return listCustomers({ id: user.id, role: user.role }, { limit: 50, ...(cursor ? { cursor } : {}) });
}
