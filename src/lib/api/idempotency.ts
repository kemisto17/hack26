import 'server-only';
import { createHash } from 'node:crypto';
import { invalid } from './validation';

function canonical(value: unknown, key = ''): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) invalid('Fingerprint numbers must be safe integers.');
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    if (key.endsWith('_minor')) {
      if (!/^-?\d+$/.test(value)) invalid('Money must be an integer decimal string.');
      value = BigInt(value).toString();
    } else if (key === 'at' || key.endsWith('_at')) {
      if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) invalid('Expected a timestamp with timezone.');
      value = new Date(value).toISOString();
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${Array.from(value, item => canonical(item)).join(',')}]`;
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key], key)}`).join(',')}}`;
  }
  return invalid('Fingerprint input must be JSON.');
}
/** Pass validated caller input only; omit retry/version headers and resolved defaults. */
export function fingerprintRequest(operation: string, resource_id: string | null, input: unknown): string {
  return createHash('sha256').update(canonical({ operation, resource_id, input })).digest('hex');
}
