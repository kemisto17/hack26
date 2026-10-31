import { setAccess } from '@/modules/identity/service';
import { accessInput } from '@/modules/identity/validation';
import { identityResponse } from '@/modules/identity/http';
import { expectedVersion, jsonBody } from '@/lib/api/validation';

export function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  return identityResponse(request, 'identity.access.update', async actor => {
    const expected_version = expectedVersion(request.headers);
    const input = accessInput(await jsonBody(request));
    const { id } = await context.params;
    const user = await setAccess(actor, id, { ...input, expected_version });
    return { data: user, version: user.version };
  });
}
