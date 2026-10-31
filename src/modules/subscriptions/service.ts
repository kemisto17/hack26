import "server-only";
import type { Actor, Creation, CreateSubscriptionInput, CreateTemplateInput, LineSelection, Mutation, Page, PageQuery, PlanPolicy, PricedLine, RenewSubscriptionInput, SubscriptionAction, SubscriptionDTO, SubscriptionQuery, SubscriptionSummaryDTO, TemplateDTO, UpdateDraftInput, UpdateTemplateInput } from "./contracts";
import { SubscriptionError } from "./errors";
import { assertStaff, assertVisible } from "./lifecycle";
import { dateRange, instant, parseCreateSubscription, parseCreateTemplate, parseRenew, parseUpdateDraft, parseUpdateTemplate, uuid, version } from "./validation";

/** Request-scoped bindings to D1 Auth/DB and D2 pricing. No global actor/client,
 * environment reads, fallback Auth, REST writes, or replacement pricing here.
 * This is not a live service until D1/D2 bind their real public exports. */
export type SubscriptionBindings = {
  requireActor(): Promise<Actor>;
  readSubscription(actor: Actor, id: string): Promise<SubscriptionDTO | null>;
  readSubscriptions(actor: Actor, query: SubscriptionQuery): Promise<Page<SubscriptionSummaryDTO>>;
  readTemplate(actor: Actor, id: string): Promise<TemplateDTO | null>;
  readTemplates(actor: Actor, query: PageQuery): Promise<Page<TemplateDTO>>;
  readPlanPolicy(actor: Actor, planId: string): Promise<PlanPolicy>;
  priceQuote(actor: Actor, input: { plan_id: string; lines: LineSelection[]; at: string }): Promise<{ currency: string; lines: PricedLine[]; subtotal_minor: string }>;
  // These calls MUST each execute a single service-role-only PostgreSQL RPC.
  createSubscriptionTransaction(args: { p_actor_id: string; p_request_key: string; p_input: CreateSubscriptionInput }): Promise<SubscriptionDTO>;
  mutateSubscriptionTransaction(args: { p_actor_id: string; p_subscription_id: string; p_expected_version: string; p_action: SubscriptionAction; p_input: Record<string, unknown> }): Promise<SubscriptionDTO>;
  createTemplateTransaction(actor: Actor, input: CreateTemplateInput): Promise<TemplateDTO>;
  updateTemplateTransaction(actor: Actor, id: string, input: UpdateTemplateInput & Mutation): Promise<TemplateDTO>;
};

/** Each method keeps the documented (actor, id?, input) signature. D1 supplies
 * fresh bindings per request, then routes/server components call these methods.
 * Database transactions remain authoritative for all state/version/retry checks. */
export function bindSubscriptionServices(bindings: SubscriptionBindings) {
  async function current(actor: Actor) {
    const verified = await bindings.requireActor();
    if (verified.id !== actor.id) throw new SubscriptionError("FORBIDDEN", "Session actor mismatch.");
    return verified; // use the current DB role, never the supplied role
  }
  async function admin(actor: Actor) {
    const verified = await current(actor);
    if (verified.role !== "admin") throw new SubscriptionError("FORBIDDEN", "Admin access required.");
    return verified;
  }
  async function read(actor: Actor, id: string) {
    const subscription = await bindings.readSubscription(actor, uuid(id));
    if (!subscription) throw new SubscriptionError("NOT_FOUND", "Subscription not found.");
    assertVisible(actor, subscription);
    return subscriptionDTO(subscription);
  }
  async function mutate(actor: Actor, id: string, action: SubscriptionAction, input: Mutation, payload: Record<string, unknown> = {}) {
    const verified = await current(actor);
    if (!["pause", "resume", "close", "renew"].includes(action)) assertStaff(verified);
    if (verified.role === "customer") await read(verified, id);
    // Do not version-check/reprice before the RPC: renewal retries must
    // replay before stale-version checks, even after catalog/template changes.
    return subscriptionDTO(await bindings.mutateSubscriptionTransaction({ p_actor_id: verified.id, p_subscription_id: uuid(id), p_expected_version: version(input.expected_version), p_action: action, p_input: payload }));
  }
  return {
    async listSubscriptions(actor: Actor, query: SubscriptionQuery = {}): Promise<Page<SubscriptionSummaryDTO>> {
      const verified = await current(actor);
      const scoped = { ...pageQuery(query), ...(query.status !== undefined ? { status: subscriptionStatus(query.status) } : {}), ...(verified.role === "customer" ? { customer_id: verified.id } : query.customer_id !== undefined ? { customer_id: uuid(query.customer_id) } : {}) };
      if (verified.role === "customer" && scoped.status === "draft") return { items: [], next_cursor: null };
      const page = await bindings.readSubscriptions(verified, scoped);
      return { items: page.items.filter(item => verified.role !== "customer" || (item.customer_id === verified.id && item.status !== "draft")).map(summaryDTO), next_cursor: page.next_cursor };
    },
    async getSubscription(actor: Actor, id: string) { return read(await current(actor), id); },
    async createSubscription(actor: Actor, input: CreateSubscriptionInput & Creation) {
      const verified = await current(actor); assertStaff(verified);
      const { request_key, ...body } = input;
      return subscriptionDTO(await bindings.createSubscriptionTransaction({ p_actor_id: verified.id, p_request_key: uuid(request_key), p_input: parseCreateSubscription(body) }));
    },
    async updateDraft(actor: Actor, id: string, input: UpdateDraftInput & Mutation) {
      const { expected_version, ...body } = input;
      return mutate(actor, id, "draft_update", { expected_version }, parseUpdateDraft(body));
    },
    quoteSubscription: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "quotation", input),
    reviseQuotation: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "revise", input),
    confirmSubscription: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "confirm", input),
    activateSubscription: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "activate", input),
    pauseSubscription: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "pause", input),
    resumeSubscription: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "resume", input),
    closeSubscription: (actor: Actor, id: string, input: Mutation) => mutate(actor, id, "close", input),
    async renewSubscription(actor: Actor, id: string, input: RenewSubscriptionInput & Mutation & Creation) {
      const { request_key, expected_version, ...body } = input;
      return mutate(actor, id, "renew", { expected_version }, { ...parseRenew(body), request_key: uuid(request_key) });
    },
    async listTemplates(actor: Actor, query: PageQuery = {}): Promise<Page<TemplateDTO>> {
      const verified = await current(actor); assertStaff(verified);
      const page = await bindings.readTemplates(verified, pageQuery(query));
      return { items: page.items.map(templateDTO), next_cursor: page.next_cursor };
    },
    async getTemplate(actor: Actor, id: string) {
      const verified = await current(actor); assertStaff(verified);
      const template = await bindings.readTemplate(verified, uuid(id));
      if (!template) throw new SubscriptionError("NOT_FOUND", "Template not found.");
      return templateDTO(template);
    },
    async createTemplate(actor: Actor, input: CreateTemplateInput) {
      return templateDTO(await bindings.createTemplateTransaction(await admin(actor), parseCreateTemplate(input)));
    },
    async updateTemplate(actor: Actor, id: string, input: UpdateTemplateInput & Mutation) {
      const verified = await admin(actor);
      const { expected_version, ...body } = input;
      return templateDTO(await bindings.updateTemplateTransaction(verified, uuid(id), { ...parseUpdateTemplate(body), expected_version: version(expected_version) }));
    },
    /** Staff-only preview. Never used to overwrite accepted lines or sent to an
     * RPC as trusted prices. D2's reviewed SQL validates prices under DB locks. */
    async previewDraft(actor: Actor, id: string, at: string) {
      const verified = await current(actor); assertStaff(verified);
      const subscription = await read(verified, id);
      if (subscription.status !== "draft") throw new SubscriptionError("INVALID_TRANSITION", "Only drafts may be repriced.");
      dateRange(subscription.start_at, subscription.expires_at);
      return bindings.priceQuote(verified, { plan_id: subscription.plan_id, lines: subscription.lines.map(selection), at: instant(at) });
    },
    async getOwnerActions(actor: Actor, id: string) {
      const verified = await current(actor);
      const subscription = await read(verified, id);
      return { subscription, plan: await bindings.readPlanPolicy(verified, subscription.plan_id) };
    },
  };
}
export type SubscriptionServices = ReturnType<typeof bindSubscriptionServices>;

function subscriptionStatus(value: string): SubscriptionSummaryDTO["status"] {
  if (!["draft", "quotation", "confirmed", "active", "paused", "closed"].includes(value)) throw new SubscriptionError("VALIDATION_ERROR", "Invalid status.");
  return value as SubscriptionSummaryDTO["status"];
}
function pageQuery(query: PageQuery): PageQuery {
  const limit = query.limit ?? 25;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || (query.cursor !== undefined && (typeof query.cursor !== "string" || !query.cursor || query.cursor.length > 4096))) throw new SubscriptionError("VALIDATION_ERROR", "Invalid pagination.");
  // D1's RLS read binding validates opaque cursor contents and filter binding.
  return { limit, ...(query.cursor !== undefined ? { cursor: query.cursor } : {}) };
}
function selection(line: LineSelection): LineSelection {
  return { product_id: line.product_id, ...(line.variant_id ? { variant_id: line.variant_id } : {}), quantity: line.quantity, is_primary: line.is_primary };
}
function summaryDTO(row: SubscriptionSummaryDTO): SubscriptionSummaryDTO {
  return { id: row.id, number: row.number, customer_id: row.customer_id, plan_id: row.plan_id, currency: row.currency, status: row.status, start_at: row.start_at, expires_at: row.expires_at, next_billing_at: row.next_billing_at, version: row.version, created_at: row.created_at, updated_at: row.updated_at };
}
function subscriptionDTO(row: SubscriptionDTO): SubscriptionDTO {
  return { ...summaryDTO(row), template_id: row.template_id, discount_id: row.discount_id, renewed_from_id: row.renewed_from_id, quote_expires_at: row.quote_expires_at, payment_terms_days: row.payment_terms_days, billing_anchor_at: row.billing_anchor_at, closed_at: row.closed_at, lines: row.lines.map(line => ({ ...selection(line), id: line.id, description: line.description, variant_label: line.variant_label, unit_price_minor: line.unit_price_minor })) };
}
function templateDTO(row: TemplateDTO): TemplateDTO {
  return { id: row.id, name: row.name, plan_id: row.plan_id, valid_days: row.valid_days, payment_terms_days: row.payment_terms_days, is_active: row.is_active, version: row.version, created_at: row.created_at, updated_at: row.updated_at, lines: row.lines.map(line => ({ ...selection(line), id: line.id })) };
}
