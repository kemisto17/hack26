import type { Role, UUID, Version } from '@/lib/api/contracts';

export type UserDTO = { id: UUID; display_name: string; role: Role; is_active: boolean; version: Version; created_at: string; updated_at: string };
