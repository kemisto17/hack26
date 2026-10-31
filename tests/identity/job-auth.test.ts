import { afterEach, expect, it, vi } from 'vitest';
import { requireJobActor } from '@/lib/api/job-auth';

afterEach(() => vi.unstubAllEnvs());
it('accepts only the distinct server job secret and refuses browser/cookie requests', () => {
  vi.stubEnv('BILLING_JOB_SECRET', 'fake-job-secret-with-at-least-32-characters');
  vi.stubEnv('SUPABASE_SECRET_KEY', 'fake-service-secret-with-at-least-32-characters');
  const make = (headers: Record<string, string>) => new Request('https://app.test/api/v1/billing/run', { method: 'POST', headers });
  expect(requireJobActor(make({ Authorization: 'Bearer fake-job-secret-with-at-least-32-characters' }))).toEqual({ kind: 'billing_job' });
  const rejected: Record<string, string>[] = [{}, { Authorization: 'Bearer wrong' }, { Cookie: 'session=fake', Authorization: 'Bearer fake-job-secret-with-at-least-32-characters' }, { Origin: 'https://app.test', Authorization: 'Bearer fake-job-secret-with-at-least-32-characters' }];
  for (const headers of rejected) expect(() => requireJobActor(make(headers))).toThrow();
  vi.stubEnv('BILLING_JOB_SECRET', 'fake-service-secret-with-at-least-32-characters');
  expect(() => requireJobActor(make({ Authorization: 'Bearer fake-service-secret-with-at-least-32-characters' }))).toThrow();
});
