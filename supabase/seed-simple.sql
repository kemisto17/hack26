-- Simple seed data for demonstration
-- Run this with: supabase db query --local --file supabase/seed-simple.sql
-- Or for remote: supabase db query --db-url "your-connection-string" --file supabase/seed-simple.sql

BEGIN;

-- Note: You must create auth users first via the Supabase dashboard or Auth API
-- Then update these IDs with your actual auth user IDs

-- For this demo, we'll insert test data that can work with any user IDs
-- Replace these with your actual auth.users IDs after creating them

DO $$
DECLARE
  -- Products
  software_prod_id uuid;
  service_prod_id uuid;
  addon_prod_id uuid;
  
  -- Variants
  variant_starter_id uuid;
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

BEGIN
  RAISE NOTICE 'Starting seed data creation...';
  
  -- Clean up existing data (for re-running seed)
  DELETE FROM quotation_template_lines;
  DELETE FROM quotation_templates;
  DELETE FROM discount_products;
  DELETE FROM discounts;
  DELETE FROM plans;
  DELETE FROM variants;
  DELETE FROM products;
  DELETE FROM tax_rules;
  
  RAISE NOTICE 'Cleaned existing catalog data';
  
  -- Insert tax rules
  INSERT INTO tax_rules (name, rate_bps, starts_on, is_active)
  VALUES 
    ('VAT 20%', 2000, '2024-01-01', true),
    ('Sales Tax 8.5%', 850, '2024-01-01', true)
  RETURNING id INTO tax_rule_id;
  
  SELECT id INTO tax_rule_id FROM tax_rules WHERE name = 'VAT 20%';
  RAISE NOTICE 'Created tax rules';
  
  -- Insert products
  INSERT INTO products (name, product_type, sales_price_minor, cost_price_minor, currency, notes, tax_rule_id, is_active)
  VALUES 
    ('Cloud Platform', 'software', 9900, 2000, 'USD', 'Professional cloud hosting platform', tax_rule_id, true),
    ('Premium Support', 'service', 49900, 15000, 'USD', '24/7 dedicated support team', tax_rule_id, true),
    ('Extra Storage', 'addon', 1900, 500, 'USD', '100GB additional storage per unit', tax_rule_id, true);
  
  SELECT id INTO software_prod_id FROM products WHERE name = 'Cloud Platform';
  SELECT id INTO service_prod_id FROM products WHERE name = 'Premium Support';
  SELECT id INTO addon_prod_id FROM products WHERE name = 'Extra Storage';
  RAISE NOTICE 'Created 3 products';
  
  -- Insert variants
  INSERT INTO variants (product_id, name, attributes, price_adjustment_minor, is_active)
  VALUES 
    (software_prod_id, 'Starter', '{"tier": "starter", "users": 5, "storage_gb": 50}', -2000, true),
    (software_prod_id, 'Professional', '{"tier": "professional", "users": 25, "storage_gb": 250}', 0, true),
    (software_prod_id, 'Enterprise', '{"tier": "enterprise", "users": "unlimited", "storage_gb": 1000, "sla": "99.99%"}', 40000, true);
  
  SELECT id INTO variant_starter_id FROM variants WHERE name = 'Starter';
  SELECT id INTO variant_pro_id FROM variants WHERE name = 'Professional';
  SELECT id INTO variant_enterprise_id FROM variants WHERE name = 'Enterprise';
  RAISE NOTICE 'Created 3 variants';
  
  -- Insert plans
  INSERT INTO plans (product_id, name, price_minor, currency, billing_interval, min_quantity, available_from, auto_close, allow_close, allow_pause, allow_renew, is_active)
  VALUES 
    (software_prod_id, 'Monthly Plan', 9900, 'USD', 'monthly', 1, '2024-01-01', false, true, true, true, true),
    (software_prod_id, 'Annual Plan', 99000, 'USD', 'yearly', 1, '2024-01-01', false, true, false, true, true),
    (service_prod_id, 'Support Monthly', 49900, 'USD', 'monthly', 1, '2024-01-01', false, true, true, true, true);
  
  SELECT id INTO plan_monthly_id FROM plans WHERE name = 'Monthly Plan';
  SELECT id INTO plan_yearly_id FROM plans WHERE name = 'Annual Plan';
  RAISE NOTICE 'Created 3 plans';
  
  -- Insert discounts
  INSERT INTO discounts (code, name, scope, kind, amount_minor, currency, min_quantity, min_subtotal_minor, starts_at, is_active)
  VALUES 
    ('WELCOME50', 'Welcome Discount - $50 off', 'subscription', 'fixed', 5000, 'USD', 1, 10000, NOW() - INTERVAL '1 day', true),
    ('SAVE100', 'Save $100', 'subscription', 'fixed', 10000, 'USD', 1, 50000, NOW() - INTERVAL '1 day', true);
  
  INSERT INTO discounts (code, name, scope, kind, percent_bps, min_quantity, min_subtotal_minor, starts_at, is_active)
  VALUES 
    ('ANNUAL20', 'Annual Plan - 20% off', 'subscription', 'percentage', 2000, 1, 0, NOW() - INTERVAL '1 day', true),
    ('SAVE15', 'Save 15%', 'subscription', 'percentage', 1500, 1, 0, NOW() - INTERVAL '1 day', true);
  
  SELECT id INTO discount_fixed_id FROM discounts WHERE code = 'WELCOME50';
  SELECT id INTO discount_percent_id FROM discounts WHERE code = 'ANNUAL20';
  RAISE NOTICE 'Created 4 discounts';
  
  -- Insert quotation template
  INSERT INTO quotation_templates (name, plan_id, valid_days, payment_terms_days, is_active)
  VALUES 
    ('Standard Professional Quote', plan_monthly_id, 30, 14, true),
    ('Enterprise Annual Quote', plan_yearly_id, 60, 30, true);
  
  SELECT id INTO template_id FROM quotation_templates WHERE name = 'Standard Professional Quote';
  RAISE NOTICE 'Created 2 quotation templates';
  
  -- Insert quotation template lines for first template
  INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, is_primary)
  VALUES 
    (template_id, software_prod_id, variant_pro_id, 1, true),
    (template_id, addon_prod_id, NULL, 3, false);
  
  -- Insert template lines for second template
  SELECT id INTO template_id FROM quotation_templates WHERE name = 'Enterprise Annual Quote';
  INSERT INTO quotation_template_lines (template_id, product_id, variant_id, quantity, is_primary)
  VALUES 
    (template_id, software_prod_id, variant_enterprise_id, 1, true);
  
  RAISE NOTICE 'Created quotation template lines';
  
  RAISE NOTICE '✅ Seed data created successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📦 Created:';
  RAISE NOTICE '  - 2 Tax Rules';
  RAISE NOTICE '  - 3 Products (Cloud Platform, Premium Support, Extra Storage)';
  RAISE NOTICE '  - 3 Variants (Starter, Professional, Enterprise)';
  RAISE NOTICE '  - 3 Plans (Monthly, Annual, Support Monthly)';
  RAISE NOTICE '  - 4 Discounts (WELCOME50, SAVE100, ANNUAL20, SAVE15)';
  RAISE NOTICE '  - 2 Quotation Templates';
  RAISE NOTICE '';
  RAISE NOTICE '📧 Next Steps:';
  RAISE NOTICE '  1. Create auth users via Supabase Dashboard or signup UI';
  RAISE NOTICE '  2. Login as admin to create subscriptions';
  RAISE NOTICE '  3. Use the quotation templates to create quotes';
  RAISE NOTICE '';
  
END $$;

COMMIT;
