export type UUID = string;
export type Minor = string;
export type Version = string;
export type Role = 'admin' | 'internal' | 'customer';
/** Derived on the server; never deserialize an Actor from request input. */
export type Actor = { id: UUID; role: Role };
export type PageQuery = { limit?: number; cursor?: string };
export type Page<T> = { items: T[]; next_cursor: string | null };
export type Mutation = { expected_version: Version };
export type Creation = { request_key: UUID };
export type Success<T> = { data: T; request_id: UUID; page?: { next_cursor: string | null } };
export type Failure = { error: { code: string; message: string; fields: Record<string, string> }; request_id: UUID };
