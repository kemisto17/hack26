-- D1 owns migration ordering. Append new migrations after this baseline.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table public.users (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null default '' check (length(display_name) <= 200),
  role text not null default 'customer' check (role in ('admin','internal','customer')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table public.tax_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  rate_bps integer not null check (rate_bps between 0 and 10000),
  starts_on date not null,
  ends_on date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (ends_on is null or ends_on >= starts_on)
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  product_type text not null check (product_type in ('software','service','addon')),
  sales_price_minor bigint not null check (sales_price_minor between 0 and 9000000000000),
  cost_price_minor bigint not null check (cost_price_minor between 0 and 9000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  notes text not null default '' check (length(notes) <= 10000),
  tax_rule_id uuid references public.tax_rules(id) on delete restrict,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table public.variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  price_adjustment_minor bigint not null default 0 check (price_adjustment_minor between -9000000000000 and 9000000000000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  unique (product_id, name),
  unique (id, product_id)
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 200),
  price_minor bigint not null check (price_minor between 0 and 9000000000000),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  billing_interval text not null check (billing_interval in ('daily','weekly','monthly','yearly')),
  min_quantity integer not null default 1 check (min_quantity between 1 and 1000000),
  available_from date not null default current_date,
  available_until date,
  auto_close boolean not null default true,
  allow_close boolean not null default true,
  allow_pause boolean not null default false,
  allow_renew boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (available_until is null or available_until >= available_from)
);

create table public.discounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{1,50}$'),
  name text not null check (length(trim(name)) between 1 and 200),
  scope text not null check (scope in ('product','subscription')),
  kind text not null check (kind in ('fixed','percentage')),
  amount_minor bigint check (amount_minor between 1 and 9000000000000),
  currency text check (currency ~ '^[A-Z]{3}$'),
  percent_bps integer check (percent_bps between 1 and 10000),
  min_quantity integer not null default 1 check (min_quantity between 1 and 1000000),
  min_subtotal_minor bigint not null default 0 check (min_subtotal_minor between 0 and 9000000000000000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  max_uses integer check (max_uses > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (ends_at is null or ends_at > starts_at),
  check ((kind = 'fixed' and amount_minor is not null and currency is not null and percent_bps is null)
      or (kind = 'percentage' and amount_minor is null and percent_bps is not null)),
  check (min_subtotal_minor = 0 or currency is not null)
);

create table public.discount_products (
  discount_id uuid not null references public.discounts(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  primary key (discount_id, product_id)
);

create table public.quotation_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  plan_id uuid not null references public.plans(id) on delete restrict,
  valid_days integer not null default 30 check (valid_days between 1 and 3650),
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table public.quotation_template_lines (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.quotation_templates(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid,
  quantity integer not null check (quantity between 1 and 1000000),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.variants(id, product_id) on delete restrict
);
create unique index template_one_primary_idx on public.quotation_template_lines(template_id) where is_primary;

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (length(trim(number)) between 1 and 100),
  customer_id uuid not null references public.users(id) on delete restrict,
  plan_id uuid not null references public.plans(id) on delete restrict,
  template_id uuid references public.quotation_templates(id) on delete restrict,
  discount_id uuid references public.discounts(id) on delete restrict,
  renewed_from_id uuid unique references public.subscriptions(id) on delete restrict,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft','quotation','confirmed','active','paused','closed')),
  start_at timestamptz not null,
  expires_at timestamptz not null,
  quote_expires_at timestamptz,
  payment_terms_days integer not null default 30 check (payment_terms_days between 0 and 365),
  billing_anchor_at timestamptz,
  next_billing_at timestamptz,
  closed_at timestamptz,
  created_by uuid not null references public.users(id) on delete restrict,
  request_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (expires_at > start_at),
  check (renewed_from_id is null or renewed_from_id <> id),
  unique (created_by, request_key),
  unique (id, customer_id, currency)
);

create table public.subscription_lines (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.subscriptions(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid,
  description text not null check (length(trim(description)) between 1 and 1000),
  variant_label text,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_minor bigint not null check (unit_price_minor between 0 and 9000000000000),
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.variants(id, product_id) on delete restrict
);
create unique index subscription_one_primary_idx on public.subscription_lines(subscription_id) where is_primary;

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique check (length(trim(number)) between 1 and 100),
  subscription_id uuid not null,
  customer_id uuid not null,
  currency text not null,
  status text not null default 'draft' check (status in ('draft','confirmed','paid','cancelled')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  issued_at timestamptz,
  due_on date not null,
  sent_at timestamptz,
  customer_snapshot jsonb not null default '{}'::jsonb check (jsonb_typeof(customer_snapshot) = 'object'),
  subtotal_minor bigint not null default 0 check (subtotal_minor between 0 and 9000000000000000),
  discount_minor bigint not null default 0 check (discount_minor between 0 and subtotal_minor),
  tax_minor bigint not null default 0 check (tax_minor between 0 and 9000000000000000),
  total_minor bigint generated always as (subtotal_minor - discount_minor + tax_minor) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0),
  check (period_end > period_start),
  unique (subscription_id, period_start),
  unique (id, customer_id, currency),
  foreign key (subscription_id, customer_id, currency)
    references public.subscriptions(id, customer_id, currency) on delete restrict
);

create table public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  subscription_line_id uuid not null references public.subscription_lines(id) on delete restrict,
  description text not null check (length(trim(description)) between 1 and 1000),
  variant_label text,
  quantity integer not null check (quantity between 1 and 1000000),
  unit_price_minor bigint not null check (unit_price_minor between 0 and 9000000000000),
  discount_minor bigint not null default 0 check (discount_minor between 0 and quantity::bigint * unit_price_minor),
  tax_rule_id uuid references public.tax_rules(id) on delete restrict,
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_minor bigint not null default 0 check (tax_minor between 0 and 9000000000000000),
  amount_minor bigint generated always as (quantity::bigint * unit_price_minor - discount_minor + tax_minor) stored,
  created_at timestamptz not null default now(),
  unique (invoice_id, subscription_line_id)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null,
  customer_id uuid not null,
  currency text not null,
  amount_minor bigint not null check (amount_minor between 1 and 9000000000000000),
  method text not null check (method in ('bank_transfer','cash','card','other')),
  paid_at timestamptz not null,
  note text not null default '' check (length(note) <= 2000),
  external_reference text unique check (length(external_reference) between 1 and 200),
  recorded_by uuid not null references public.users(id) on delete restrict,
  request_key uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (recorded_by, request_key),
  foreign key (invoice_id, customer_id, currency)
    references public.invoices(id, customer_id, currency) on delete restrict
);

create table public.discount_redemptions (
  id uuid primary key default gen_random_uuid(),
  discount_id uuid not null references public.discounts(id) on delete restrict,
  invoice_id uuid not null unique references public.invoices(id) on delete restrict,
  amount_minor bigint not null check (amount_minor between 1 and 9000000000000000),
  created_at timestamptz not null default now()
);

-- Leading FK indexes also support parent ownership joins and operational queues.
create index products_tax_rule_idx on public.products(tax_rule_id);
create index plans_product_idx on public.plans(product_id);
create index discount_products_product_idx on public.discount_products(product_id);
create index templates_plan_idx on public.quotation_templates(plan_id);
create index template_lines_template_idx on public.quotation_template_lines(template_id);
create index template_lines_product_idx on public.quotation_template_lines(product_id);
create index template_lines_variant_idx on public.quotation_template_lines(variant_id, product_id);
create index subscriptions_customer_idx on public.subscriptions(customer_id, created_at desc, id);
create index subscriptions_plan_idx on public.subscriptions(plan_id);
create index subscriptions_template_idx on public.subscriptions(template_id);
create index subscriptions_discount_idx on public.subscriptions(discount_id);
create index subscriptions_due_idx on public.subscriptions(next_billing_at, id) where status = 'active';
create index subscription_lines_parent_idx on public.subscription_lines(subscription_id);
create index subscription_lines_product_idx on public.subscription_lines(product_id);
create index subscription_lines_variant_idx on public.subscription_lines(variant_id, product_id);
create index invoices_customer_idx on public.invoices(customer_id, created_at desc, id);
create index invoices_outstanding_idx on public.invoices(due_on, id) where status = 'confirmed';
create index invoice_lines_subscription_line_idx on public.invoice_lines(subscription_line_id);
create index invoice_lines_tax_rule_idx on public.invoice_lines(tax_rule_id);
create index payments_invoice_idx on public.payments(invoice_id, customer_id, currency);
create index payments_customer_idx on public.payments(customer_id, paid_at desc, id);
create index redemptions_discount_idx on public.discount_redemptions(discount_id);

-- Fail closed even if the access-control migration is interrupted or not applied.
do $$
declare t text;
begin
  foreach t in array array['users','tax_rules','products','variants','plans','discounts',
    'discount_products','quotation_templates','quotation_template_lines','subscriptions',
    'subscription_lines','invoices','invoice_lines','payments','discount_redemptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', t);
  end loop;
end;
$$;
commit;
