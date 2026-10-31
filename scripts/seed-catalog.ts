#!/usr/bin/env tsx
/**
 * Seed catalog data (products, plans, discounts, etc.)
 * This creates the base catalog that admins can use to create subscriptions
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local
try {
  const envPath = resolve(process.cwd(), '.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const [key, ...valueParts] = trimmed.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
} catch (error) {
  console.warn('Could not load .env.local');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function seedCatalog() {
  console.log('🌱 Seeding catalog data...\n');

  // Note: Cleaning may not work due to RLS, so we'll use upsert where possible
  console.log('🧹 Attempting to clean existing data...');
  
  // Try to delete but don't fail if it doesn't work
  try {
    const { error: e1 } = await supabase.from('quotation_template_lines').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    const { error: e2 } = await supabase.from('quotation_templates').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    const { error: e3 } = await supabase.from('discount_products').delete().gte('discount_id', '00000000-0000-0000-0000-000000000000');
    const { error: e4 } = await supabase.from('discounts').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    const { error: e5 } = await supabase.from('plans').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    const { error: e6 } = await supabase.from('variants').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    const { error: e7 } = await supabase.from('products').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    const { error: e8 } = await supabase.from('tax_rules').delete().gte('id', '00000000-0000-0000-0000-000000000000');
    console.log('  ✓ Cleaned (or skipped due to RLS)');
  } catch (err) {
    console.log('  ⚠ Cleanup skipped (RLS restrictions)');
  }

  // Create tax rules
  console.log('💰 Creating tax rules...');
  const { data: taxRules, error: taxError } = await supabase
    .from('tax_rules')
    .insert([
      { name: 'VAT 20%', rate_bps: 2000, starts_on: '2024-01-01', is_active: true },
      { name: 'Sales Tax 8.5%', rate_bps: 850, starts_on: '2024-01-01', is_active: true },
    ])
    .select();

  if (taxError) {
    console.error('Error creating tax rules:', taxError);
    throw taxError;
  }

  const vatRule = taxRules[0];
  console.log(`  ✓ Created ${taxRules.length} tax rules`);

  // Create products
  console.log('📦 Creating products...');
  const { data: products, error: prodError } = await supabase
    .from('products')
    .insert([
      {
        name: 'Cloud Platform',
        product_type: 'software',
        sales_price_minor: 9900,
        cost_price_minor: 2000,
        currency: 'USD',
        notes: 'Professional cloud hosting platform',
        tax_rule_id: vatRule.id,
        is_active: true,
      },
      {
        name: 'Premium Support',
        product_type: 'service',
        sales_price_minor: 49900,
        cost_price_minor: 15000,
        currency: 'USD',
        notes: '24/7 dedicated support team',
        tax_rule_id: vatRule.id,
        is_active: true,
      },
      {
        name: 'Extra Storage',
        product_type: 'addon',
        sales_price_minor: 1900,
        cost_price_minor: 500,
        currency: 'USD',
        notes: '100GB additional storage per unit',
        tax_rule_id: vatRule.id,
        is_active: true,
      },
    ])
    .select();

  if (prodError) {
    console.error('Error creating products:', prodError);
    throw prodError;
  }

  const [cloudProduct, supportProduct, storageProduct] = products;
  console.log(`  ✓ Created ${products.length} products`);

  // Create variants
  console.log('🎨 Creating product variants...');
  const { data: variants, error: varError } = await supabase
    .from('variants')
    .insert([
      {
        product_id: cloudProduct.id,
        name: 'Starter',
        attributes: { tier: 'starter', users: 5, storage_gb: 50 },
        price_adjustment_minor: -2000,
        is_active: true,
      },
      {
        product_id: cloudProduct.id,
        name: 'Professional',
        attributes: { tier: 'professional', users: 25, storage_gb: 250 },
        price_adjustment_minor: 0,
        is_active: true,
      },
      {
        product_id: cloudProduct.id,
        name: 'Enterprise',
        attributes: { tier: 'enterprise', users: 'unlimited', storage_gb: 1000, sla: '99.99%' },
        price_adjustment_minor: 40000,
        is_active: true,
      },
    ])
    .select();

  if (varError) {
    console.error('Error creating variants:', varError);
    throw varError;
  }

  const [starterVariant, proVariant, enterpriseVariant] = variants;
  console.log(`  ✓ Created ${variants.length} variants`);

  // Create plans
  console.log('📋 Creating subscription plans...');
  const { data: plans, error: planError } = await supabase
    .from('plans')
    .insert([
      {
        product_id: cloudProduct.id,
        name: 'Monthly Plan',
        price_minor: 9900,
        currency: 'USD',
        billing_interval: 'monthly',
        min_quantity: 1,
        available_from: '2024-01-01',
        auto_close: false,
        allow_close: true,
        allow_pause: true,
        allow_renew: true,
        is_active: true,
      },
      {
        product_id: cloudProduct.id,
        name: 'Annual Plan',
        price_minor: 99000,
        currency: 'USD',
        billing_interval: 'yearly',
        min_quantity: 1,
        available_from: '2024-01-01',
        auto_close: false,
        allow_close: true,
        allow_pause: false,
        allow_renew: true,
        is_active: true,
      },
      {
        product_id: supportProduct.id,
        name: 'Support Monthly',
        price_minor: 49900,
        currency: 'USD',
        billing_interval: 'monthly',
        min_quantity: 1,
        available_from: '2024-01-01',
        auto_close: false,
        allow_close: true,
        allow_pause: true,
        allow_renew: true,
        is_active: true,
      },
    ])
    .select();

  if (planError) {
    console.error('Error creating plans:', planError);
    throw planError;
  }

  const [monthlyPlan, yearlyPlan, supportPlan] = plans;
  console.log(`  ✓ Created ${plans.length} plans`);

  // Create discounts
  console.log('🎫 Creating discounts...');
  
  // Check for existing discounts first
  const { data: existingDiscounts } = await supabase
    .from('discounts')
    .select('code')
    .in('code', ['WELCOME50', 'SAVE100', 'ANNUAL20', 'SAVE15']);
  
  const existingCodes = new Set(existingDiscounts?.map(d => d.code) || []);
  
  const discountsToCreate = [
    {
      code: 'WELCOME50',
      name: 'Welcome Discount - $50 off',
      scope: 'subscription',
      kind: 'fixed',
      amount_minor: 5000,
      currency: 'USD',
      min_quantity: 1,
      min_subtotal_minor: 10000,
      starts_at: new Date(Date.now() - 86400000).toISOString(),
      max_uses: 100,
      is_active: true,
    },
    {
      code: 'SAVE100',
      name: 'Save $100',
      scope: 'subscription',
      kind: 'fixed',
      amount_minor: 10000,
      currency: 'USD',
      min_quantity: 1,
      min_subtotal_minor: 50000,
      starts_at: new Date(Date.now() - 86400000).toISOString(),
      max_uses: 50,
      is_active: true,
    },
    {
      code: 'ANNUAL20',
      name: 'Annual Discount - 20% off',
      scope: 'subscription',
      kind: 'percentage',
      percent_bps: 2000,
      min_quantity: 1,
      min_subtotal_minor: 0,
      starts_at: new Date(Date.now() - 86400000).toISOString(),
      is_active: true,
    },
    {
      code: 'SAVE15',
      name: 'Save 15%',
      scope: 'subscription',
      kind: 'percentage',
      percent_bps: 1500,
      min_quantity: 1,
      min_subtotal_minor: 0,
      starts_at: new Date(Date.now() - 86400000).toISOString(),
      is_active: true,
    },
  ].filter(d => !existingCodes.has(d.code));

  let discounts = [];
  if (discountsToCreate.length > 0) {
    const { data, error: discError } = await supabase
      .from('discounts')
      .insert(discountsToCreate)
      .select();

    if (discError) {
      console.error('Error creating discounts:', discError);
      throw discError;
    }
    discounts = data;
    console.log(`  ✓ Created ${discounts.length} new discounts`);
  } else {
    console.log(`  ✓ All discounts already exist`);
  }
  
  // Get all discounts for summary
  const { data: allDiscounts } = await supabase.from('discounts').select('id');
  const totalDiscounts = allDiscounts?.length || 0;

  // Create quotation templates
  console.log('📄 Creating quotation templates...');
  const { data: templates, error: tempError } = await supabase
    .from('quotation_templates')
    .insert([
      {
        name: 'Standard Professional Quote',
        plan_id: monthlyPlan.id,
        valid_days: 30,
        payment_terms_days: 14,
        is_active: true,
      },
      {
        name: 'Enterprise Annual Quote',
        plan_id: yearlyPlan.id,
        valid_days: 60,
        payment_terms_days: 30,
        is_active: true,
      },
    ])
    .select();

  if (tempError) {
    console.error('Error creating templates:', tempError);
    throw tempError;
  }

  const [template1, template2] = templates;
  console.log(`  ✓ Created ${templates.length} templates`);

  // Create template lines
  const { error: lineError } = await supabase.from('quotation_template_lines').insert([
    {
      template_id: template1.id,
      product_id: cloudProduct.id,
      variant_id: proVariant.id,
      quantity: 1,
      is_primary: true,
    },
    {
      template_id: template1.id,
      product_id: storageProduct.id,
      variant_id: null,
      quantity: 3,
      is_primary: false,
    },
    {
      template_id: template2.id,
      product_id: cloudProduct.id,
      variant_id: enterpriseVariant.id,
      quantity: 1,
      is_primary: true,
    },
  ]);

  if (lineError) {
    console.error('Error creating template lines:', lineError);
    throw lineError;
  }

  console.log('  ✓ Created template lines');

  console.log('\n✅ Catalog data seeded successfully!\n');
  console.log('📦 Summary:');
  console.log(`  - ${taxRules.length} Tax Rules`);
  console.log(`  - ${products.length} Products`);
  console.log(`  - ${variants.length} Variants`);
  console.log(`  - ${plans.length} Plans`);
  console.log(`  - ${totalDiscounts} Discounts (total)`);
  console.log(`  - ${templates.length} Quotation Templates`);
  console.log('\n💡 Next: Create users via signup, then login as admin to create subscriptions\n');
}

async function main() {
  try {
    console.log('🚀 Starting catalog seeding...');
    console.log(`📍 Supabase URL: ${SUPABASE_URL}\n`);

    await seedCatalog();

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
