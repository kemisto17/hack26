-- Seed data for demonstration
-- Run this after migrations: supabase db query --local --file supabase/seed.sql
-- This creates a complete demo scenario with customers, products, subscriptions, invoices and payments

BEGIN;

-- Note: Auth users must be created via Supabase Auth API first
-- This seed assumes you have created at least 3 test users via signup
-- We'll use placeholder UUIDs that you should replace with actual auth.users IDs

-- For demo purposes, we'll create users with known UUIDs
-- In production, these would come from auth.users after signup

-- Insert demo users (admin, staff, and customers)
-- Note: These link to auth.users which must exist first via Supabase Auth
-- For seeding, we'll use gen_random_uuid() but in real usage these would be actual auth user IDs

DO $$
DECLARE
  admin_id uuid := '00000000-0000-0000-0000-000000000001';
  staff_id uuid := '00000000-0000-0000-0000-000000000002';
  customer1_id uuid := '00000000-0000-0000-0000-000000000003';
  customer2_id uuid := '00000000-0000-0000-0000-000000000004';
  
  -- Products
  software_prod_id uuid;
  service_prod_id uuid;
  addon_prod_id uuid;
  
  -- Variants
  variant_pro_id uuid;
  variant_enterprise_id uuid;
  
  -- Plans
  plan_monthly_id uuid;
  plan_yearly_id uuid;
  
  -- Tax rule
  tax_rule_id uuid;
  
  -- Discounts
  discount_fixed_id uuid;
  discount_percent_id uuid;
  
  -- Quotation template
  template_id uuid;
  
  -- Subscriptions
  sub1_id uuid;
  sub2_id uuid;
  
  -- Invoices
  inv1_id uuid;
  inv2_id uuid;

BEGIN
  -- Clean up existing data (for re-running seed)
  DELETE FROM payments;
  DELETE FROM discount_redemptions;
  DELETE FROM invoice_lines;
  DELETE FROM invoices;
  DELETE FROM subscription_lines;
  DELETE FROM subscriptions;
  DELETE FROM quotation_template_lines;
  DELETE FROM quotation_templates;
  DELETE FROM discount_products;
  DELETE FROM discounts;
  DELETE FROM plans;
  DELETE FROM variants;
  DELETE FROM products;
  DELETE FROM tax_rules;
  DELETE FROM users WHERE id IN (admin_id, staff_id, customer1_id, customer2_id);
  
  -- Insert users (these would normally come from auth.users via trigger)
  INSERT INTO users (id, display_name, role, is_active) VALUES
    (admin_id, 'Admin User', 'admin', true),
    (staff_id, 'Sales Staff', 'internal', true),
    (customer1_id, 'Acme Corporation', 'customer', true),
    (customer2_id, 'TechStart Inc', 'customer', true);
  
  -- Insert tax rules
  INSERT INTO tax_rules (name, rate_bps, starts_on, is_active)
  VALUES ('VAT 20%', 2000, '2024-01-01', true)
  RETURNING id INTO tax_rule_id;
  
  -- Insert products
  INSERT INTO products (name, product_type, sales_price_minor, cost_price_minor, currency, notes, tax_rule_id, is_active)
  VALUES 
    ('Cloud Platform Pro', 'software', 9900, 2000, 'USD', 'Professional tier cloud hosting', tax_rule_id, true),
    ('Premium Support', 'service', 49900, 15000, 'USD', 'Dedicated support team', tax_rule_id, true),
    ('Extra Storage', 'addon', 1900, 500, 'USD', '100GB additional storage', tax_rule_id, true)
  RETURNING id INTO software_prod_id, service_prod_id, addon_prod_id;
  
  -- Get the actual IDs (the above RETURNING only gets the last one)
  SELECT id INTO software_prod_id FROM products WHERE name = 'Cloud Platform Pro';
  SELECT id INTO service_prod_id FROM products WHERE name = 'Premium Support';
  SELECT id INTO addon_prod_id FROM products WHERE name = 'Extra Storage';
  
  -- Insert variants
  INSERT INTO variants (product_id, name, attributes, price_adjustment_minor, is_active)
  VALUES 
    (software_prod_id, 'Pro', '{"tier": "professional", "users": 10}', 0, true),
    (software_prod_id, 'Enterprise', '{"tier": "enterprise", "users": 100, "sla": "99.9%"}', 20000, true)
  RETURNING id INTO variant_pro_id, variant_enterprise_id;
  
  SELECT id INTO variant_pro_id FROM variants WHERE name = 'Pro';
  SELECT id INTO variant_enterprise_id FROM variants WHERE name = 'Enterprise';
  
  -- Insert plans
  INSERT INTO plans (product_id, name, price_minor, currency, billing_interval, min_quantity, available_from, auto_close, allow_close, allow_pause, allow_renew, is_active)
  VALUES 
    (software_prod_id, 'Monthly Plan', 9900, 'USD', 'monthly', 1, '2024-01-01', false, true, true, true, true),
    (software_prod_id, 'Annual Plan', 99000, 'USD', 'yearly', 1, '2024-01-01', false, true, false, true, true)
  RETURNING id INTO plan_monthly_id, plan_yearly_id;
  
  SELECT id INTO plan_monthly_id FROM plans WHERE name = 'Monthly Plan';
  SELECT id INTO plan_yearly_id FROM plans WHERE name = 'Annual Plan';
  
  -- Insert discounts
  INSERT INTO discounts (code, name, scope, kind, amount_minor, currency, min_quantity, min_subtotal_minor, starts_at, is_active)
  VALUES 
    ('WELCOME50', 'Welcome Discount - $50 off', 'subscription', 'fixed', 5000, 'USD', 1, 10000, NOW() - INTERVAL '1 day', true)
  RETURNING id INTO discount_fixed_id;
  
  INSERT INTO discounts (code, name, scope, kind, percent_bps, min_quantity, min_subtotal_minor, starts_at, is_active)
  VALUES 
    ('ANNUAL20', 'Annual Plan - 20% off', 'subscription', 'percentage', 2000, 1, 0, NOW() - INTERVAL '1 day', true)
  RETURNING id INTO discount_percent_id;
  
  -- Insert quotation template
  INSERT INTO quotation_templates (name, plan_id, valid_days, payment_terms_days, is_active)
  VALUES ('Standard Monthly Quote', plan_monthly_id, 30, 14, true)
  RETURNING id INTO template_id;
  
  -- Insert quotation template lines
  INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, is_primary)
  VALUES 
    (template_id, software_prod_id, variant_pro_id, 1, true),
    (template_id, addon_prod_id, NULL, 2, false);
  
  -- Insert subscriptions
  -- Customer 1: Active monthly subscription with discount
  INSERT INTO subscriptions (
    number, customer_id, plan_id, template_id, discount_id, currency, 
    status, start_at, expires_at, payment_terms_days, 
    billing_anchor_at, next_billing_at, created_by, request_key, request_fingerprint
  )
  VALUES (
    'SUB-' || substring(gen_random_uuid()::text, 1, 8),
    customer1_id, plan_monthly_id, template_id, discount_fixed_id, 'USD',
    'confirmed', NOW() - INTERVAL '15 days', NOW() + INTERVAL '345 days', 14,
    NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', staff_id, 
    'seed-sub-1', encode(sha256('seed-sub-1'::bytea), 'hex')
  )
  RETURNING id INTO sub1_id;
  
  -- Customer 2: Active annual subscription with percentage discount
  INSERT INTO subscriptions (
    number, customer_id, plan_id, discount_id, currency, 
    status, start_at, expires_at, payment_terms_days, 
    billing_anchor_at, next_billing_at, created_by, request_key, request_fingerprint
  )
  VALUES (
    'SUB-' || substring(gen_random_uuid()::text, 1, 8),
    customer2_id, plan_yearly_id, discount_percent_id, 'USD',
    'confirmed', NOW() - INTERVAL '60 days', NOW() + INTERVAL '305 days', 30,
    NOW() - INTERVAL '60 days', NOW() + INTERVAL '305 days', staff_id,
    'seed-sub-2', encode(sha256('seed-sub-2'::bytea), 'hex')
  )
  RETURNING id INTO sub2_id;
  
  -- Insert subscription lines for subscription 1
  INSERT INTO subscription_lines (subscription_id, product_id, variant_id, description, variant_label, quantity, unit_price_minor, is_primary)
  VALUES 
    (sub1_id, software_prod_id, variant_pro_id, 'Cloud Platform Pro', 'Pro', 1, 9900, true),
    (sub1_id, addon_prod_id, NULL, 'Extra Storage', NULL, 2, 1900, false);
  
  -- Insert subscription lines for subscription 2
  INSERT INTO subscription_lines (subscription_id, product_id, variant_id, description, variant_label, quantity, unit_price_minor, is_primary)
  VALUES 
    (sub2_id, software_prod_id, variant_enterprise_id, 'Cloud Platform Pro', 'Enterprise', 1, 29900, true);
  
  -- Insert invoices
  -- Invoice 1: Paid invoice for customer 1
  INSERT INTO invoices (
    number, subscription_id, customer_id, currency, status,
    period_start, period_end, issued_at, due_on,
    customer_snapshot, subtotal_minor, discount_minor, tax_minor
  )
  VALUES (
    'INV-' || substring(gen_random_uuid()::text, 1, 8),
    sub1_id, customer1_id, 'USD', 'paid',
    NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', NOW() - INTERVAL '14 days', NOW() + INTERVAL '1 day',
    '{"name": "Acme Corporation", "email": "billing@acme.example", "address": "123 Business St, Tech City"}',
    13700, 5000, 1740
  )
  RETURNING id INTO inv1_id;
  
  -- Invoice 2: Outstanding invoice for customer 2
  INSERT INTO invoices (
    number, subscription_id, customer_id, currency, status,
    period_start, period_end, issued_at, due_on,
    customer_snapshot, subtotal_minor, discount_minor, tax_minor
  )
  VALUES (
    'INV-' || substring(gen_random_uuid()::text, 1, 8),
    sub2_id, customer2_id, 'USD', 'outstanding',
    NOW() - INTERVAL '60 days', NOW() + INTERVAL '305 days', NOW() - INTERVAL '59 days', NOW() + INTERVAL '30 days',
    '{"name": "TechStart Inc", "email": "finance@techstart.example", "address": "456 Startup Ave, Innovation Hub"}',
    29900, 5980, 4784
  );
  
  SELECT id INTO inv2_id FROM invoices WHERE subscription_id = sub2_id;
  
  -- Insert invoice lines for invoice 1
  INSERT INTO invoice_lines (
    invoice_id, subscription_line_id, description, variant_label, 
    quantity, unit_price_minor, discount_minor, tax_rule_id, tax_rate_bps, tax_minor
  )
  SELECT 
    inv1_id, sl.id, sl.description, sl.variant_label,
    sl.quantity, sl.unit_price_minor, 
    CASE WHEN sl.is_primary THEN 5000 ELSE 0 END, -- Apply discount to primary line
    tax_rule_id, 2000,
    CASE WHEN sl.is_primary THEN 980 ELSE 760 END -- Tax calculations
  FROM subscription_lines sl
  WHERE sl.subscription_id = sub1_id;
  
  -- Insert invoice lines for invoice 2
  INSERT INTO invoice_lines (
    invoice_id, subscription_line_id, description, variant_label,
    quantity, unit_price_minor, discount_minor, tax_rule_id, tax_rate_bps, tax_minor
  )
  SELECT 
    inv2_id, sl.id, sl.description, sl.variant_label,
    sl.quantity, sl.unit_price_minor,
    5980, -- 20% discount
    tax_rule_id, 2000, 4784 -- Tax on discounted amount
  FROM subscription_lines sl
  WHERE sl.subscription_id = sub2_id;
  
  -- Insert discount redemptions
  INSERT INTO discount_redemptions (discount_id, invoice_id, amount_minor)
  VALUES 
    (discount_fixed_id, inv1_id, 5000),
    (discount_percent_id, inv2_id, 5980);
  
  -- Insert payments
  -- Full payment for invoice 1
  INSERT INTO payments (
    invoice_id, customer_id, currency, amount_minor, method, paid_at, note,
    external_reference, recorded_by, request_key, request_fingerprint
  )
  VALUES (
    inv1_id, customer1_id, 'USD', 10440, 'card', NOW() - INTERVAL '13 days', 
    'Credit card payment - ending 4242',
    'ch_' || substring(gen_random_uuid()::text, 1, 24), staff_id,
    'seed-pay-1', encode(sha256('seed-pay-1'::bytea), 'hex')
  );
  
  -- Partial payment for invoice 2
  INSERT INTO payments (
    invoice_id, customer_id, currency, amount_minor, method, paid_at, note,
    external_reference, recorded_by, request_key, request_fingerprint
  )
  VALUES (
    inv2_id, customer2_id, 'USD', 15000, 'bank_transfer', NOW() - INTERVAL '5 days',
    'Wire transfer - reference BT2024103001',
    'bt_' || substring(gen_random_uuid()::text, 1, 24), staff_id,
    'seed-pay-2', encode(sha256('seed-pay-2'::bytea), 'hex')
  );
  
  RAISE NOTICE 'Seed data created successfully!';
  RAISE NOTICE 'Admin ID: %', admin_id;
  RAISE NOTICE 'Staff ID: %', staff_id;
  RAISE NOTICE 'Customer 1 ID: %', customer1_id;
  RAISE NOTICE 'Customer 2 ID: %', customer2_id;
  RAISE NOTICE 'Subscription 1 ID: %', sub1_id;
  RAISE NOTICE 'Subscription 2 ID: %', sub2_id;
  RAISE NOTICE 'Invoice 1 ID: %', inv1_id;
  RAISE NOTICE 'Invoice 2 ID: %', inv2_id;
  
END $$;

COMMIT;
