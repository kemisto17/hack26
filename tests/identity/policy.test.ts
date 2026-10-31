import { describe, expect, it } from 'vitest';
import { validatePassword, callbackPath, profileInput, invitationInput, accessInput, pageInput } from '@/modules/identity/validation';

describe('Auth and identity input', () => {
  it('enforces every documented password rule including the digit', () => {
    expect(() => validatePassword('A-valid-9')).not.toThrow();
    for (const password of ['Abcdef1!', 'abcdefg1!', 'ABCDEFG1!', 'Abcdefghi!', 'Abcdefgh1', 'Abcdefg1 ']) expect(() => validatePassword(password)).toThrow();
  });
  it('allows only explicit local callback destinations', () => {
    expect(callbackPath('/update-password')).toBe('/update-password');
    expect(callbackPath('/portal')).toBe('/portal');
    for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/portal?next=https://evil.test', '/%2f%2fevil.test', '/admin', null]) expect(callbackPath(path)).toBe('/');
  });
  it('normalizes invitation email and rejects privilege injection and oversized profiles', () => {
    expect(invitationInput({ email: ' Staff@Example.com ', display_name: ' Staff ' })).toEqual({ email: 'staff@example.com', display_name: 'Staff' });
    expect(() => invitationInput({ email: 'a@b.test', display_name: 'A', role: 'admin' })).toThrow();
    expect(() => invitationInput({ email: 'bad', display_name: 'A' })).toThrow();
    expect(() => profileInput({ display_name: 'x'.repeat(201) })).toThrow();
    expect(() => profileInput({ display_name: 'A', is_active: false })).toThrow();
    expect(() => accessInput({})).toThrow();
    expect(() => accessInput({ role: 'superadmin' })).toThrow();
    expect(() => accessInput({ is_active: 'false' })).toThrow();
  });
  it('bounds and validates pagination and cursors before query construction', () => {
    expect(pageInput({}).limit).toBe(25);
    for (const query of [{ limit: 0 }, { limit: 101 }, { limit: 1.5 }, { cursor: 'garbage' }, { cursor: Buffer.from(JSON.stringify({ created_at: 'bad', id: 'x' })).toString('base64url') }]) expect(() => pageInput(query)).toThrow();
  });
});
