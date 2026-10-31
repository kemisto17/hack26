import 'server-only';
import { publicEnvironment } from './public';

export function appOrigin() {
  let url: URL;
  try { url = new URL(process.env.APP_ORIGIN ?? ''); } catch { throw new Error('Set APP_ORIGIN.'); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_ORIGIN must be an exact HTTPS origin (HTTP loopback allowed).');
  return url.origin;
}
export function privilegedEnvironment() {
  const { url } = publicEnvironment();
  const key = process.env.SUPABASE_SECRET_KEY;
  let serviceRole = false;
  try { serviceRole = JSON.parse(Buffer.from(key?.split('.')[1] ?? '', 'base64url').toString()).role === 'service_role'; } catch { /* Modern secret keys are not JWTs. */ }
  if (!key || (!key.startsWith('sb_secret_') && !serviceRole)) throw new Error('Set SUPABASE_SECRET_KEY on the server.');
  return { url, key };
}
