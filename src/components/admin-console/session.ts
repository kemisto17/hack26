import 'server-only';
import { redirect } from 'next/navigation';
import { AppError } from '@/lib/api/errors';
import { getMe, requireActor, listAccessUsers, listCustomers } from '@/modules/identity/service';
import type { UserDTO } from '@/modules/identity/contracts';

/** The existing identity service verifies Auth, current role and active status. */
export async function requireAdmin(): Promise<UserDTO> {
  let user: UserDTO;
  try {
    user = await getMe(await requireActor());
  } catch (error) {
    if (error instanceof AppError && ['UNAUTHENTICATED', 'FORBIDDEN'].includes(error.code)) {
      redirect('/login?reason=account');
    }
    throw error;
  }
  if (user.role === 'internal') redirect('/staff/dashboard');
  if (user.role === 'customer') redirect('/portal/dashboard');
  if (user.role !== 'admin') redirect('/login?reason=account');
  return user;
}

export async function adminDirectory(kind: 'customers' | 'users', cursor?: string) {
  const user = await requireAdmin();
  const actor = { id: user.id, role: user.role };
  const query = { limit: 100, ...(cursor ? { cursor } : {}) };
  return kind === 'customers' ? listCustomers(actor, query) : listAccessUsers(actor, query);
}
