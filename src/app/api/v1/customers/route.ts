import { listCustomers } from '@/modules/identity/service';
import { identityResponse } from '@/modules/identity/http';
import { invalid } from '@/lib/api/validation';

export function GET(request: Request) {
  return identityResponse(request, 'identity.customers.list', async actor => {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !['limit', 'cursor'].includes(key)) || [...params.keys()].some(key => params.getAll(key).length > 1)) invalid();
    const page = await listCustomers(actor, { ...(params.has('limit') ? { limit: Number(params.get('limit')) } : {}), ...(params.has('cursor') ? { cursor: params.get('cursor')! } : {}) });
    return { data: page.items, next_cursor: page.next_cursor };
  });
}
