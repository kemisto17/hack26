import type { Actor, PlanPolicy, SubscriptionAction, SubscriptionDTO } from "./contracts";
import { SubscriptionError } from "./errors";

export function assertStaff(actor: Actor) {
  if (actor.role !== "admin" && actor.role !== "internal") throw new SubscriptionError("FORBIDDEN", "Staff access required.");
}

export function assertVisible(actor: Actor, subscription: SubscriptionDTO) {
  if (actor.role === "customer" && (subscription.customer_id !== actor.id || subscription.status === "draft")) {
    throw new SubscriptionError("NOT_FOUND", "Subscription not found.");
  }
}

/** Preflight only. D1's RPC must repeat every check under its subscription lock. */
export function assertTransition(actor: Actor, subscription: SubscriptionDTO, plan: PlanPolicy, action: SubscriptionAction, expectedVersion: string, now: string) {
  assertVisible(actor, subscription);
  if (!["pause", "resume", "close", "renew"].includes(action)) assertStaff(actor);
  if (subscription.version !== expectedVersion) throw new SubscriptionError("VERSION_CONFLICT", "Refresh the subscription before trying again.");
  const time = Date.parse(now);
  if (!Number.isFinite(time)) throw new SubscriptionError("VALIDATION_ERROR", "Invalid server time.");
  const expired = time >= Date.parse(subscription.expires_at);
  const allowed = {
    draft_update: ["draft"], quotation: ["draft"], revise: ["quotation"],
    confirm: ["quotation"], activate: ["confirmed"], pause: ["active"],
    resume: ["paused"], close: ["draft", "quotation", "confirmed", "active", "paused"],
    renew: ["quotation", "confirmed", "active", "paused", "closed"],
  } satisfies Record<SubscriptionAction, string[]>;
  if (!(allowed[action] as string[]).includes(subscription.status)) fail();
  if (action === "confirm" && (!subscription.quote_expires_at || time >= Date.parse(subscription.quote_expires_at) || expired)) fail();
  if (action === "activate" && (time < Date.parse(subscription.start_at) || expired)) fail();
  if ((action === "pause" || action === "resume") && (!plan.allow_pause || expired)) fail();
  if (action === "close" && actor.role === "customer" && !expired && !plan.allow_close) fail();
  if (action === "renew" && !plan.allow_renew) fail();
}

function fail(): never {
  throw new SubscriptionError("INVALID_TRANSITION", "This action is unavailable for the current subscription state or plan.");
}

export function permittedOwnerActions(actor: Actor, subscription: SubscriptionDTO, plan: PlanPolicy, now: string): SubscriptionAction[] {
  return (["pause", "resume", "close", "renew"] as const).filter(action => {
    try { assertTransition(actor, subscription, plan, action, subscription.version, now); return true; }
    catch (error) { if (error instanceof SubscriptionError) return false; throw error; }
  });
}
