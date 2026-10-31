import { inviteStaff } from '@/modules/identity/service';
import { invitationInput } from '@/modules/identity/validation';
import { identityResponse } from '@/modules/identity/http';
import { jsonBody } from '@/lib/api/validation';

export function POST(request: Request) {
  return identityResponse(request, 'identity.staff.invite', async actor => {
    const input = invitationInput(await jsonBody(request));
    return { data: await inviteStaff(actor, input), status: 202 };
  });
}
