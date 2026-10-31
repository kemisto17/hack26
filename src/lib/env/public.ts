type PublicEnv = { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string };
export function publicEnvironment(env: PublicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
}) {
  let url: URL;
  try { url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? ''); } catch { throw new Error('Set NEXT_PUBLIC_SUPABASE_URL.'); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Invalid public Supabase URL.');
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';
  let anonymous = false;
  try { anonymous = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { /* Modern keys are not JWTs. */ }
  if (!key.startsWith('sb_publishable_') && !anonymous) throw new Error('Set a publishable Supabase key; privileged keys are forbidden here.');
  return { url: url.origin, key };
}
