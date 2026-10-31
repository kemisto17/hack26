import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { JobActor } from './contracts';
import { AppError } from './errors';

/** D4 calls this at its job HTTP boundary; never deserialize JobActor from a body. */
export function requireJobActor(request: Request): JobActor {
  const request_id = crypto.randomUUID();
  const secret = process.env.BILLING_JOB_SECRET;
  if (!secret || secret.length < 32 || secret === process.env.SUPABASE_SECRET_KEY) throw new AppError('INTERNAL_ERROR', 'Configure a distinct server job secret.');
  const token = /^Bearer (\S+)$/.exec(request.headers.get('authorization') ?? '')?.[1] ?? '';
  const digest = (value: string) => createHash('sha256').update(value).digest();
  const allowed = timingSafeEqual(digest(token), digest(secret)) && !request.headers.has('origin') && !request.headers.has('cookie');
  console.info(JSON.stringify({ request_id, action: 'billing.authenticate', outcome: allowed ? 'allowed' : 'denied' }));
  if (!allowed) throw new AppError('UNAUTHENTICATED', 'Job authentication required.');
  return { kind: 'billing_job' };
}
