import { describe, expect, it } from 'vitest';
import { fingerprintRequest } from '@/lib/api/idempotency';
import { AppError } from '@/lib/api/errors';
import { errorResponse, successResponse } from '@/lib/api/response';
import { assertOrigin, expectedVersion, strictObject } from '@/lib/api/validation';
import { publicEnvironment } from '@/lib/env/public';

describe('retry identity', () => {
  it('sorts nested keys, canonicalizes money and timestamps, and retains array order', () => {
    const a = fingerprintRequest('payment', null, { amount_minor: '00012', at: '2026-01-01T01:00:00+01:00', lines: [{ z: 2, a: 1 }, 2] });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(fingerprintRequest('payment', null, { lines: [{ a: 1, z: 2 }, 2], at: '2026-01-01T00:00:00.000Z', amount_minor: '12' }));
    expect(a).not.toBe(fingerprintRequest('other', null, { amount_minor: '12' }));
    expect(fingerprintRequest('x', null, [1, 2])).not.toBe(fingerprintRequest('x', null, [2, 1]));
    expect(fingerprintRequest('x', 'a', {})).not.toBe(fingerprintRequest('x', 'b', {}));
  });
  it('rejects lossy or non-JSON input', () => {
    for (const input of [undefined, NaN, Infinity, new Date(), { a: undefined }, { amount_minor: '1.5' }, { at: 'bad' }]) {
      expect(() => fingerprintRequest('x', null, input)).toThrow();
    }
  });
});

describe('HTTP boundary', () => {
  it('requires exact configured Origin and a quoted positive version', () => {
    expect(() => assertOrigin(new Request('https://app.test', { headers: { origin: 'https://app.test' } }), 'https://app.test')).not.toThrow();
    for (const origin of [null, 'https://app.test.evil', 'null', 'https://other.test']) {
      expect(() => assertOrigin(new Request('https://app.test', { headers: origin ? { origin } : {} }), 'https://app.test')).toThrow(AppError);
    }
    expect(expectedVersion(new Headers({ 'if-match': '"9223372036854775807"' }))).toBe('9223372036854775807');
    expect(() => expectedVersion(new Headers())).toThrow(expect.objectContaining({ code: 'PRECONDITION_REQUIRED' }));
    for (const value of ['1', '"0"', 'W/"1"', '"9223372036854775808"']) expect(() => expectedVersion(new Headers({ 'if-match': value }))).toThrow();
    expect(() => strictObject({ role: 'admin' }, ['display_name'])).toThrow();
  });
  it('redacts unexpected errors and always marks responses private', async () => {
    const response = errorResponse(new Error('secret SQL or key'));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('secret');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const conflict = errorResponse(new AppError('VERSION_CONFLICT', 'Refresh the profile.'));
    expect(conflict.status).toBe(409);
    const ok = successResponse({ version: '2' }, { version: '2' });
    expect(ok.headers.get('etag')).toBe('"2"');
    expect(await ok.json()).toEqual({ data: { version: '2' }, request_id: expect.any(String) });
  });
});

describe('public environment', () => {
  it('accepts publishable keys and rejects privileged keys and non-HTTPS remote URLs', () => {
    expect(publicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }).url).toBe('https://demo.supabase.co');
    for (const key of ['sb_secret_bad', '', `x.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x`]) {
      expect(() => publicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'https://demo.supabase.co', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key })).toThrow();
    }
    expect(() => publicEnvironment({ NEXT_PUBLIC_SUPABASE_URL: 'http://remote.test', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' })).toThrow();
  });
});
