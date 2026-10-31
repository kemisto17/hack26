import { getMe, updateMe } from '@/modules/identity/service';
import { profileInput } from '@/modules/identity/validation';
import { identityResponse } from '@/modules/identity/http';
import { expectedVersion, jsonBody } from '@/lib/api/validation';

export function GET(request: Request) {
  return identityResponse(request, 'identity.me.read', async actor => {
    const user = await getMe(actor);
    return { data: user, version: user.version };
  });
}
export function PATCH(request: Request) {
  return identityResponse(request, 'identity.me.update', async actor => {
    const expected_version = expectedVersion(request.headers);
    const input = profileInput(await jsonBody(request));
    const user = await updateMe(actor, { ...input, expected_version });
    return { data: user, version: user.version };
  });
}
