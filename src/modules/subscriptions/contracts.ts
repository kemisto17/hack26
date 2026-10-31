/** D3 wire shapes. Shared scalar/Actor and D2 line types remain structurally
 * compatible with docs/api-contracts.md until their owning modules land. */
export type UUID = string;
export type Version = string;
export type Actor = { id: UUID; role: "admin" | "internal" | "customer" };
export type Mutation = { expected_version: Version };
export type Creation = { request_key: UUID };
export type PageQuery = { limit?: number; cursor?: string };
export type Page<T> = { items: T[]; next_cursor: string | null };
export type LineSelection = {
  product_id: UUID; variant_id?: UUID; quantity: number; is_primary: boolean;
};
export type PricedLine = LineSelection & {
  id: UUID; description: string; variant_label: string | null; unit_price_minor: string;
};
export type SubscriptionStatus = "draft" | "quotation" | "confirmed" | "active" | "paused" | "closed";
export type SubscriptionAction = "draft_update" | "quotation" | "revise" | "confirm" | "activate" | "pause" | "resume" | "close" | "renew";
export type SubscriptionSummaryDTO = {
  id: UUID; number: string; customer_id: UUID; plan_id: UUID; currency: string;
  status: SubscriptionStatus; start_at: string; expires_at: string;
  next_billing_at: string | null; version: Version; created_at: string; updated_at: string;
};
export type SubscriptionDTO = SubscriptionSummaryDTO & {
  template_id: UUID | null; discount_id: UUID | null; renewed_from_id: UUID | null;
  quote_expires_at: string | null; payment_terms_days: number;
  billing_anchor_at: string | null; closed_at: string | null; lines: PricedLine[];
};
export type TemplateDTO = {
  id: UUID; name: string; plan_id: UUID; valid_days: number; payment_terms_days: number;
  is_active: boolean; version: Version; created_at: string; updated_at: string;
  lines: (LineSelection & { id: UUID })[];
};
export type CreateTemplateInput = {
  name: string; plan_id: UUID; valid_days?: number; payment_terms_days?: number; lines: LineSelection[];
};
export type UpdateTemplateInput = Partial<CreateTemplateInput> & { is_active?: boolean };
type SubscriptionTerms = {
  customer_id: UUID; plan_id: UUID; discount_id?: UUID | null;
  start_at: string; expires_at: string; payment_terms_days?: number;
};
export type CreateSubscriptionInput = SubscriptionTerms & (
  { template_id: UUID; lines?: never } | { template_id?: never; lines: LineSelection[] }
);
export type UpdateDraftInput = {
  lines?: LineSelection[]; discount_id?: UUID | null; start_at?: string;
  expires_at?: string; payment_terms_days?: number;
};
export type RenewSubscriptionInput = { start_at: string; expires_at: string };
export type SubscriptionQuery = PageQuery & { status?: SubscriptionStatus; customer_id?: UUID };
export type PlanPolicy = {
  allow_pause: boolean; allow_close: boolean; allow_renew: boolean;
};
