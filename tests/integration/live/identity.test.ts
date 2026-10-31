import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { getBillingContact, inviteStaff, requireActor } from '@/modules/identity/service';
import { restorePasswordSession } from '@/modules/identity/password-session';

const context = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ getAll: () => [...context.jar].map(([name, value]) => ({ name, value })), set: (name: string, value: string) => context.jar.set(name, value) }) }));
// Direct service tests supply only Next's request context; Auth, HTTP and database stay real.
vi.mock('next/server', async original => ({ ...await original<typeof import('next/server')>(), connection: async () => {} }));
if (existsSync('.env.local')) process.loadEnvFile('.env.local');
const ref = process.env.HACK26_TEST_PROJECT_REF;
if (!ref || ref !== process.env.SUPABASE_PROJECT_REF || new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'invalid').hostname !== `${ref}.supabase.co`) throw new Error('Live tests require matching HACK26_TEST_PROJECT_REF, SUPABASE_PROJECT_REF and development URL. Never target production.');
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
if (!process.env.SUPABASE_SECRET_KEY) throw new Error('Live tests require the server development key.');
const admin = createClient(url, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = 'http://127.0.0.1:3107';
const password = 'D1-testing-9!';
const run = crypto.randomUUID();
const users: Array<{ id: string; email: string }> = [];
let server: ChildProcess | undefined;
let serverOutput = '';

function sql(query: string) {
  const result = spawnSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked', '--project-ref', ref!, query], { encoding: 'utf8', timeout: 30000 });
  if (result.status !== 0) throw new Error(`Fixture SQL failed: ${result.stderr}`);
}
async function fixture(name: string) {
  const email = `d1-${name}-${run}@example.com`;
  const result = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: name, role: 'admin' } });
  if (result.error) throw result.error;
  const user = { id: result.data.user.id, email }; users.push(user); return user;
}
function session(jar = new Map<string, string>()) {
  return { jar, client: createServerClient(url, key, { cookies: { getAll: () => [...jar].map(([name, value]) => ({ name, value })), setAll: values => values.forEach(({ name, value }) => value ? jar.set(name, value) : jar.delete(name)) } }) };
}
type Session = ReturnType<typeof session>;
async function login(email: string, suppliedPassword = password) {
  const current = session();
  const result = await current.client.auth.signInWithPassword({ email, password: suppliedPassword });
  if (result.error) throw result.error;
  return current;
}
async function request(path: string, current?: Session, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (current) headers.set('Cookie', [...current.jar].map(([name, value]) => `${name}=${value}`).join('; '));
  let response: Response;
  try { response = await fetch(origin + path, { ...init, headers, redirect: 'manual', signal: AbortSignal.timeout(10000) }); }
  catch (error) { throw new Error(`Test HTTP ${init.method ?? 'GET'} ${path.split('?')[0]} failed (server exit: ${server?.exitCode}).`, { cause: error }); }
  for (const cookie of response.headers.getSetCookie()) {
    const first = cookie.split(';')[0]; const split = first.indexOf('=');
    if (current) current.jar.set(first.slice(0, split), first.slice(split + 1));
  }
  return response;
}
const patch = (body: unknown, version = '1', requestOrigin: string | null = origin): RequestInit => ({ method: 'PATCH', headers: { 'Content-Type': 'application/json', 'If-Match': `"${version}"`, ...(requestOrigin ? { Origin: requestOrigin } : {}) }, body: JSON.stringify(body) });
async function changeAccess(actor: Session, id: string, changes: { role?: string; is_active?: boolean }) {
  const profile = await admin.from('users').select('version').eq('id', id).single();
  if (profile.error) throw profile.error;
  expect((await request(`/api/v1/users/${id}/access`, actor, patch(changes, String(profile.data.version)))).status).toBe(200);
}
let customerA: Awaited<ReturnType<typeof fixture>>;
let customerB: Awaited<ReturnType<typeof fixture>>;
let adminA: Awaited<ReturnType<typeof fixture>>;
let adminB: Awaited<ReturnType<typeof fixture>>;
let staff: Awaited<ReturnType<typeof fixture>>;
let a: Session, aa: Session, bb: Session, internal: Session;

beforeAll(async () => {
  // Last-admin assertions require an otherwise empty admin set, not a shared dev account.
  const existing = await admin.from('users').select('id', { count: 'exact', head: true }).eq('role', 'admin').eq('is_active', true);
  if (existing.error) throw existing.error;
  if (existing.count !== 0) throw new Error('Live identity tests require a disposable database with no existing active administrators. No fixtures were created.');
  [customerA, customerB, adminA, adminB, staff] = await Promise.all(['customer-a', 'customer-b', 'admin-a', 'admin-b', 'staff'].map(fixture));
  sql(`update public.users set role='admin' where id in ('${adminA.id}','${adminB.id}'); update public.users set role='internal' where id='${staff.id}';`);
  [a, aa, bb, internal] = await Promise.all([customerA, adminA, adminB, staff].map(user => login(user.email)));
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3107'], { env: { ...process.env, APP_ORIGIN: origin }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout?.on('data', chunk => { serverOutput += String(chunk); });
  server.stderr?.on('data', chunk => { serverOutput += String(chunk); });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (server.exitCode !== null) throw new Error(`Test server exited: ${serverOutput}`);
    try { if ((await fetch(origin + '/login')).ok) return; } catch { /* Wait for our test server to bind. */ }
    await delay(250);
  }
  throw new Error(`Test server did not start: ${serverOutput}`);
}, 60000);

afterAll(async () => {
  server?.kill();
  if (users.length) {
    const ids = users.map(user => `'${user.id}'`).join(',');
    sql(`delete from private.staff_invitations where invited_by in (${ids}) or user_id in (${ids}); delete from public.users where id in (${ids});`);
    for (const user of users) { const result = await admin.auth.admin.deleteUser(user.id); if (result.error) throw result.error; }
  }
}, 60000);

describe('real Auth, HTTP and Data API', () => {
  it('streams role-appropriate shells without prerendering Auth session work', async () => {
    const workspace = await request('/admin/dashboard', aa);
    const workspaceHTML = await workspace.text();
    expect(workspaceHTML).toContain('Business overview');
    expect(workspaceHTML).toContain('/admin/staff/invite');
    const portalHTML = await (await request('/portal/dashboard', a)).text();
    expect(portalHTML).toContain('Your account');
    expect(portalHTML).not.toContain('Invite internal staff');
    expect(serverOutput).not.toContain('unstable value `Date.now()`');
  });
  it('returns private safe profiles and denies anonymous, forged and cross-customer access', async () => {
    expect((await request('/api/v1/me')).status).toBe(401);
    const response = await request('/api/v1/me', a);
    expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toContain('private, no-store');
    const body = await response.json();
    await vi.waitFor(() => expect(serverOutput).toContain(body.request_id));
    const audit = serverOutput.split('\n').filter(line => line.startsWith('{')).map(line => JSON.parse(line)).find(event => event.request_id === body.request_id);
    expect(audit).toEqual({ request_id: body.request_id, action: 'identity.me.read', actor_id: customerA.id, outcome: 'success' });
    expect(serverOutput).not.toContain(customerA.email);
    expect(body.data).toMatchObject({ id: customerA.id, role: 'customer', version: '1' });
    expect(Object.keys(body.data).sort()).toEqual(['created_at', 'display_name', 'id', 'is_active', 'role', 'updated_at', 'version']);
    const own = await a.client.from('users').select('id'); expect(own.error).toBeNull(); expect(own.data).toEqual([{ id: customerA.id }]);
    expect((await a.client.from('users').select('id').eq('id', customerB.id)).data).toEqual([]);
    expect((await a.client.from('users').update({ role: 'admin' }).eq('id', customerA.id)).error).not.toBeNull();
    expect((await a.client.rpc('identity_set_access', { p_actor_id: adminA.id, p_user_id: customerA.id, p_expected_version: 1, p_role: 'admin' })).error).not.toBeNull();
    context.jar = a.jar;
    expect(await requireActor()).toEqual({ id: customerA.id, role: 'customer' });
    await expect(getBillingContact({ id: customerA.id, role: 'admin' }, customerB.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('validates Origin, mutation fields and If-Match and preserves stale writes', async () => {
    for (const badOrigin of [null, 'https://evil.example']) expect((await request('/api/v1/me', a, patch({ display_name: 'Blocked' }, '1', badOrigin))).status).toBe(403);
    expect((await request('/api/v1/me', a, patch({ display_name: 'A', role: 'admin' }))).status).toBe(400);
    expect((await request('/api/v1/me', a, { method: 'PATCH', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ display_name: 'A' }) })).status).toBe(428);
    const changed = await request('/api/v1/me', a, patch({ display_name: 'Customer renamed' }));
    expect(changed.status).toBe(200); expect(changed.headers.get('etag')).toBe('"2"');
    expect((await request('/api/v1/me', a, patch({ display_name: 'Stale' }))).status).toBe(409);
    expect((await (await request('/api/v1/me', a)).json()).data.display_name).toBe('Customer renamed');
  });
  it('paginates the staff-only customer directory', async () => {
    expect((await request('/api/v1/customers', a)).status).toBe(403);
    const first = await (await request('/api/v1/customers?limit=1', internal)).json();
    expect(first.data).toHaveLength(1); expect(first.data[0].role).toBe('customer'); expect(first.page.next_cursor).toEqual(expect.any(String));
    const second = await (await request(`/api/v1/customers?limit=1&cursor=${first.page.next_cursor}`, internal)).json();
    expect(second.data[0].id).not.toBe(first.data[0].id);
    expect((await request('/api/v1/customers?cursor=bad', internal)).status).toBe(400);
  });
  it('denies customer and internal staff invitations and access changes', async () => {
    for (const current of [a, internal]) {
      expect((await request('/api/v1/staff/invitations', current, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `never-sent-${run}@example.com`, display_name: 'Denied' }) })).status).toBe(403);
      expect((await request(`/api/v1/users/${customerB.id}/access`, current, patch({ role: 'admin' }))).status).toBe(403);
    }
  });
  it('reads billing contact only for the verified current staff actor', async () => {
    context.jar = internal.jar;
    expect(await getBillingContact({ id: staff.id, role: 'internal' }, customerB.id)).toEqual({ display_name: 'customer-b', email: customerB.email });
    await expect(getBillingContact({ id: customerA.id, role: 'admin' }, customerB.id)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
  it('denies existing sessions immediately when a profile is disabled', async () => {
    await changeAccess(aa, staff.id, { is_active: false });
    try {
      expect((await request('/api/v1/me', internal)).status).toBe(403);
      expect((await request('/api/v1/customers', internal)).status).toBe(403);
    } finally { await changeAccess(aa, staff.id, { is_active: true }); }
  });
  it('serializes concurrent admin demotions and rejects outdated access versions', async () => {
    const results = await Promise.all([
      request(`/api/v1/users/${adminA.id}/access`, aa, patch({ role: 'customer' }, '2')),
      request(`/api/v1/users/${adminB.id}/access`, bb, patch({ role: 'customer' }, '2')),
    ]);
    try {
      expect(results.map(result => result.status).sort()).toEqual([200, 409]);
      const active = await admin.from('users').select('id').eq('role', 'admin').eq('is_active', true);
      expect(active.data).toHaveLength(1);
    } finally {
      const active = await admin.from('users').select('id').eq('role', 'admin').eq('is_active', true).single();
      if (active.error) throw active.error;
      await changeAccess(active.data.id === adminA.id ? aa : bb, active.data.id === adminA.id ? adminB.id : adminA.id, { role: 'admin' });
    }
    expect((await request(`/api/v1/users/${customerA.id}/access`, aa, patch({ is_active: false }, '1'))).status).toBe(409);
  });
  it('recovers a real Auth invitation without another delivery and never promotes on retry', async () => {
    const email = `d1-invited-${run}@example.com`;
    const prepared = await admin.rpc('identity_prepare_invitation', { p_actor_id: adminA.id, p_email: email, p_display_name: 'Invited staff' });
    expect(prepared.error).toBeNull();
    const reservation = prepared.data as { id: string; claim_token: string };
    const link = await admin.auth.admin.generateLink({ type: 'invite', email });
    if (link.error) throw link.error;
    const invited = { id: link.data.user.id, email }; users.push(invited);
    expect((await admin.from('users').select('role').eq('id', invited.id).single()).data?.role).toBe('customer');
    expect((await admin.rpc('identity_release_invitation', { p_actor_id: adminA.id, p_invitation_id: reservation.id, p_claim_token: reservation.claim_token })).error).toBeNull();
    context.jar = aa.jar;
    expect(await inviteStaff({ id: adminA.id, role: 'admin' }, { email: email.toUpperCase(), display_name: 'Invited staff' })).toEqual({ accepted: true });
    expect((await admin.from('users').select('role').eq('id', invited.id).single()).data?.role).toBe('internal');
    const verifiedInvite = await fetch(link.data.properties.action_link, { redirect: 'manual' });
    const destination = verifiedInvite.headers.get('location');
    if (!destination) throw new Error('Auth invitation verification did not redirect.');
    const fragment = new URL(destination).hash;
    expect(fragment.startsWith('#access_token=')).toBe(true);
    const inviteSession = session();
    await restorePasswordSession(inviteSession.client, fragment);
    expect((await request('/auth/callback?next=/update-password')).headers.get('location')).toBe(origin + '/update-password');
    expect((await (await request('/api/v1/me', inviteSession)).json()).data.role).toBe('internal');
    await expect(restorePasswordSession(session().client, '#access_token=bad&type=invite')).rejects.toThrow();
    const response = await request('/api/v1/staff/invitations', aa, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, display_name: 'Invited staff' }) });
    expect(response.status).toBe(202); expect(await response.json()).toMatchObject({ data: { accepted: true } });
    await changeAccess(aa, invited.id, { role: 'customer' });
    expect(await inviteStaff({ id: adminA.id, role: 'admin' }, { email, display_name: 'Invited staff' })).toEqual({ accepted: true });
    expect((await admin.from('users').select('role').eq('id', invited.id).single()).data?.role).toBe('customer');
  });
  it('requires confirmation, consumes real signup/reset tokens once and rejects open redirects', async () => {
    const email = `d1-confirm-${run}@example.com`;
    const generated = await admin.auth.admin.generateLink({ type: 'signup', email, password, options: { data: { display_name: 'Confirmed', role: 'admin' } } });
    if (generated.error) throw generated.error;
    users.push({ id: generated.data.user.id, email });
    const unconfirmed = await session().client.auth.signInWithPassword({ email, password }); expect(unconfirmed.error).not.toBeNull();
    const confirmed = session();
    const response = await request(`/auth/callback?token_hash=${generated.data.properties.hashed_token}&type=signup&next=${encodeURIComponent('https://evil.example')}`, confirmed);
    expect(response.status).toBe(303); expect(response.headers.get('location')).toBe(origin + '/');
    expect((await (await request('/api/v1/me', confirmed)).json()).data.role).toBe('customer');
    const recovery = await admin.auth.admin.generateLink({ type: 'recovery', email }); if (recovery.error) throw recovery.error;
    const reset = session();
    const path = `/auth/callback?token_hash=${recovery.data.properties.hashed_token}&type=recovery&next=/update-password`;
    expect((await request(path, reset)).headers.get('location')).toBe(origin + '/update-password');
    const updated = await session(reset.jar).client.auth.updateUser({ password: 'Changed-password-2!' }); expect(updated.error).toBeNull();
    expect((await session().client.auth.signInWithPassword({ email, password })).error).not.toBeNull();
    expect((await login(email, 'Changed-password-2!')).jar.size).toBeGreaterThan(0);
    expect((await request(path)).headers.get('location')).toBe(origin + '/login?error=callback');
    expect((await request('/auth/callback?code=invalid&next=//evil.example')).headers.get('location')).toBe(origin + '/login?error=callback');
  });
  it('reflects the hosted password policy and removes signed-out session access', async () => {
    for (const weak of ['Short1!', 'lowercase9!', 'UPPERCASE9!', 'NoDigitsHere!', 'NoSymbolsHere9']) {
      const result = await session().client.auth.signUp({ email: `d1-weak-${run}@example.com`, password: weak });
      expect(result.error).not.toBeNull(); expect(result.data.user).toBeNull();
    }
    const logout = await login(customerB.email);
    expect((await request('/api/v1/me', logout)).status).toBe(200);
    expect((await logout.client.auth.signOut({ scope: 'local' })).error).toBeNull();
    expect((await request('/api/v1/me', logout)).status).toBe(401);
  });
});
