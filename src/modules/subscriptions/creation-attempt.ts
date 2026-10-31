import type { CreateSubscriptionInput, Creation } from "./contracts";
import { SubscriptionError } from "./errors";
import { parseCreateSubscription, uuid } from "./validation";

/** Keep an uncertain create retry tied to its original caller input. Never save
 * this customer data to localStorage. The DB still enforces retry uniqueness. */
export function prepareDraftAttempt(previous: (CreateSubscriptionInput & Creation) | null, input: CreateSubscriptionInput, newKey: () => string): CreateSubscriptionInput & Creation {
  const normalized = parseCreateSubscription(input);
  if (previous) {
    const { request_key, ...original } = previous;
    if (JSON.stringify(original) !== JSON.stringify(normalized)) throw new SubscriptionError("IDEMPOTENCY_CONFLICT", "Retry the original draft before changing its inputs. Check the subscription list if the result is uncertain.");
    return { ...normalized, request_key };
  }
  return { ...normalized, request_key: uuid(newKey()) };
}
