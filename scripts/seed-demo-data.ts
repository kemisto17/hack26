#!/usr/bin/env tsx
/**
 * Seed script for creating demonstrable dummy data
 * Creates auth users, then populates all application tables
 * 
 * Usage: 
 *   npm run seed:demo
 * 
 * Prerequisites:
 *   - Supabase local instance running (supabase start)
 *   - Environment variables configured in .env.local
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env.local manually
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
  console.warn('Could not load .env.local, using existing environment variables');
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_KEY ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

interface DemoUser {
  email: string;
  password: string;
  displayName: string;
  role: 'admin' | 'internal' | 'customer';
}

const demoUsers: DemoUser[] = [
  {
    email: 'admin@brightloop.demo',
    password: 'Admin123!@#',
    displayName: 'Admin User',
    role: 'admin',
  },
  {
    email: 'sales@brightloop.demo',
    password: 'Sales123!@#',
    displayName: 'Sales Staff',
    role: 'internal',
  },
  {
    email: 'acme@customer.demo',
    password: 'Acme123!@#',
    displayName: 'Acme Corporation',
    role: 'customer',
  },
  {
    email: 'techstart@customer.demo',
    password: 'Tech123!@#',
    displayName: 'TechStart Inc',
    role: 'customer',
  },
];

async function createAuthUsers() {
  console.log('\n📝 Creating auth users...');
  const userIds: Record<string, string> = {};

  for (const user of demoUsers) {
    // Check if user already exists
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existing = existingUsers?.users.find((u) => u.email === user.email);

    if (existing) {
      console.log(`  ✓ User ${user.email} already exists (${existing.id})`);
      userIds[user.email] = existing.id;
      
      // Update user profile to ensure correct role
      await supabase
        .from('users')
        .update({ display_name: user.displayName, role: user.role })
        .eq('id', existing.id);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true,
        user_metadata: {
          display_name: user.displayName,
        },
      });

      if (error) {
        console.error(`  ✗ Failed to create ${user.email}:`, error.message);
        throw error;
      }

      console.log(`  ✓ Created ${user.email} (${data.user.id})`);
      userIds[user.email] = data.user.id;

      // Update the user profile with correct role (trigger creates as customer by default)
      if (user.role !== 'customer') {
        await supabase
          .from('users')
          .update({ role: user.role })
          .eq('id', data.user.id);
      }
    }
  }

  return userIds;
}

async function seedData(userIds: Record<string, string>) {
  console.log('\n🌱 Seeding application data...');

  const adminId = userIds['admin@brightloop.demo'];
  const staffId = userIds['sales@brightloop.demo'];
  const customer1Id = userIds['acme@customer.demo'];
  const customer2Id = userIds['techstart@customer.demo'];

  // Clean existing data
  console.log('  🧹 Cleaning existing data...');
  await supabase.from('payments').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('discount_redemptions').delete().neq('discount_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('invoice_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('invoices').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('subscription_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('subscriptions').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('quotation_template_lines').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('quotation_templates').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('discount_products').delete().neq('discount_id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('discounts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('plans').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('variants').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('tax_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000');

  // Create tax rules
  console.log('  💰 Creating tax rules...');
  const { data: taxRules } = await supabase
    .from('tax_rules')
    .insert([
      { name: 'VAT 20%', rate_bps: 2000, starts_on: '2024-01-01', is_active: true },
      { name: 'Sales Tax 8.5%', rate_bps: 850, starts_on: '2024-01-01', is_active: true },
    ])
    .select();

  const vatRule = taxRules![0];
  console.log(`    ✓ Created tax rule: ${vatRule.name}`);

  // Create products
  console.log('  📦 Creating products...');
  const { data: products } = await supabase
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

  const [cloudProduct, supportProduct, storageProduct] = products!;
  console.log(`    ✓ Created ${products!.length} products`);

  // Create variants
  console.log('  🎨 Creating product variants...');
  const { data: variants } = await supabase
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

  const [starterVariant, proVariant, enterpriseVariant] = variants!;
  console.log(`    ✓ Created ${variants!.length} variants`);

  // Create plans
  console.log('  📋 Creating subscription plans...');
  const { data: plans } = await supabase
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
    ])
    .select();

  const [monthlyPlan, yearlyPlan] = plans!;
  console.log(`    ✓ Created ${plans!.length} plans`);

  // Create discounts
  console.log('  🎫 Creating discounts...');
  const { data: discounts } = await supabase
    .from('discounts')
    .insert([
      {
        code: 'WELCOME50',
        name: 'Welcome Discount',
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
        code: 'ANNUAL20',
        name: 'Annual Discount',
        scope: 'subscription',
        kind: 'percentage',
        percent_bps: 2000,
        min_quantity: 1,
        min_subtotal_minor: 0,
        starts_at: new Date(Date.now() - 86400000).toISOString(),
        is_active: true,
      },
    ])
    .select();

  const [welcomeDiscount, annualDiscount] = discounts!;
  console.log(`    ✓ Created ${discounts!.length} discounts`);

  // Create quotation template
  console.log('  📄 Creating quotation template...');
  const { data: templates } = await supabase
    .from('quotation_templates')
    .insert([
      {
        name: 'Standard Professional Quote',
        plan_id: monthlyPlan.id,
        valid_days: 30,
        payment_terms_days: 14,
        is_active: true,
      },
    ])
    .select();

  const template = templates![0];

  await supabase.from('quotation_template_lines').insert([
    {
      template_id: template.id,
      product_id: cloudProduct.id,
      variant_id: proVariant.id,
      quantity: 1,
      is_primary: true,
    },
    {
      template_id: template.id,
      product_id: storageProduct.id,
      variant_id: null,
      quantity: 3,
      is_primary: false,
    },
  ]);

  console.log('    ✓ Created template with 2 lines');

  // Create subscriptions
  console.log('  📝 Creating subscriptions...');
  const now = new Date();
  const sub1Number = `SUB-${crypto.randomUUID().substring(0, 8)}`;
  const sub2Number = `SUB-${crypto.randomUUID().substring(0, 8)}`;

  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .insert([
      {
        number: sub1Number,
        customer_id: customer1Id,
        plan_id: monthlyPlan.id,
        template_id: template.id,
        discount_id: welcomeDiscount.id,
        currency: 'USD',
        status: 'confirmed',
        start_at: new Date(now.getTime() - 15 * 86400000).toISOString(),
        expires_at: new Date(now.getTime() + 345 * 86400000).toISOString(),
        payment_terms_days: 14,
        billing_anchor_at: new Date(now.getTime() - 15 * 86400000).toISOString(),
        next_billing_at: new Date(now.getTime() + 15 * 86400000).toISOString(),
        created_by: staffId,
        request_key: 'seed-sub-1',
        request_fingerprint: Buffer.from('seed-sub-1').toString('hex'),
      },
      {
        number: sub2Number,
        customer_id: customer2Id,
        plan_id: yearlyPlan.id,
        discount_id: annualDiscount.id,
        currency: 'USD',
        status: 'confirmed',
        start_at: new Date(now.getTime() - 60 * 86400000).toISOString(),
        expires_at: new Date(now.getTime() + 305 * 86400000).toISOString(),
        payment_terms_days: 30,
        billing_anchor_at: new Date(now.getTime() - 60 * 86400000).toISOString(),
        next_billing_at: new Date(now.getTime() + 305 * 86400000).toISOString(),
        created_by: staffId,
        request_key: 'seed-sub-2',
        request_fingerprint: Buffer.from('seed-sub-2').toString('hex'),
      },
    ])
    .select();

  if (subError) {
    console.error('    ✗ Failed to create subscriptions:', subError);
    throw subError;
  }

  if (!subscriptions || subscriptions.length === 0) {
    throw new Error('No subscriptions returned from insert');
  }

  const [sub1, sub2] = subscriptions;
  console.log(`    ✓ Created ${subscriptions.length} subscriptions`);

  // Create subscription lines
  await supabase.from('subscription_lines').insert([
    {
      subscription_id: sub1.id,
      product_id: cloudProduct.id,
      variant_id: proVariant.id,
      description: 'Cloud Platform',
      variant_label: 'Professional',
      quantity: 1,
      unit_price_minor: 9900,
      is_primary: true,
    },
    {
      subscription_id: sub1.id,
      product_id: storageProduct.id,
      variant_id: null,
      description: 'Extra Storage',
      variant_label: null,
      quantity: 3,
      unit_price_minor: 1900,
      is_primary: false,
    },
    {
      subscription_id: sub2.id,
      product_id: cloudProduct.id,
      variant_id: enterpriseVariant.id,
      description: 'Cloud Platform',
      variant_label: 'Enterprise',
      quantity: 1,
      unit_price_minor: 49900,
      is_primary: true,
    },
  ]);

  console.log('    ✓ Created subscription lines');

  console.log('\n✅ Demo data seeded successfully!\n');
  console.log('📧 Demo User Credentials:');
  console.log('  Admin:      admin@brightloop.demo / Admin123!@#');
  console.log('  Staff:      sales@brightloop.demo / Sales123!@#');
  console.log('  Customer 1: acme@customer.demo / Acme123!@#');
  console.log('  Customer 2: techstart@customer.demo / Tech123!@#');
  console.log('\n💡 You can now login with any of these accounts!');
}

async function main() {
  try {
    console.log('🚀 Starting demo data seeding...');
    console.log(`📍 Supabase URL: ${SUPABASE_URL}`);

    const userIds = await createAuthUsers();
    await seedData(userIds);

    console.log('\n🎉 All done!\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding data:', error);
    process.exit(1);
  }
}

main();
