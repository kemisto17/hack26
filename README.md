# Brightloop - Subscription Management System

A complete, production-ready subscription management system built with Next.js, TypeScript, and Supabase. Designed for SaaS businesses that need robust recurring billing, quotation workflows, and customer self-service.

## 📋 Overview

Brightloop is a subscription management platform that handles the complete lifecycle from product catalog to recurring billing:

- **Product Catalog Management** - Products, variants, plans, and pricing
- **Tax & Discount Rules** - Flexible tax rules and discount codes (fixed or percentage)
- **Quotation Workflows** - Template-based quotes with approval flows
- **Subscription Lifecycle** - Draft → Quotation → Confirmed → Active → Billed
- **Recurring Billing** - Automatic invoice generation for daily/weekly/monthly/yearly intervals
- **Payment Tracking** - Verified payment recording with idempotent receipts
- **Role-Based Access** - Admin, Internal Staff, and Customer roles with granular permissions
- **Customer Portal** - Self-service subscription viewing and management

## 🏗️ Architecture

### Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS 4
- **Database:** PostgreSQL 17 via Supabase
- **Authentication:** Supabase Auth with email/password
- **Runtime:** Node.js 20+
- **Deployment:** Vercel-ready

### Key Features

- ✅ **Type-Safe** - End-to-end TypeScript with generated database types
- ✅ **Secure** - Row Level Security (RLS), CSRF protection, role-based authorization
- ✅ **Transactional** - PostgreSQL stored procedures for atomic multi-row operations
- ✅ **Idempotent** - Safe retry of creation and payment operations
- ✅ **Auditable** - Full versioning and audit trails on all entities
- ✅ **Money-Safe** - Integer minor units (cents) with proper rounding
- ✅ **Multi-Currency** - Support for any ISO currency code
- ✅ **Test-Covered** - SQL regression tests and integration test framework

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account (free tier works) or Docker for local development

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone <repository-url>
   cd hack26
   npm install
   ```

2. **Set up Supabase:**

   **Option A: Remote (Recommended for quick start)**
   - Go to [supabase.com/dashboard](https://supabase.com/dashboard)
   - Create a new project (takes ~2 minutes)
   - Copy your credentials from Settings → API

   **Option B: Local Development**
   ```bash
   # Install Supabase CLI
   npm install -g supabase
   
   # Start local Supabase (requires Docker)
   supabase start
   
   # Get credentials
   supabase status --local
   ```

3. **Configure environment variables:**
   
   Create `.env.local` in the project root:
   ```env
   # From Supabase dashboard Settings → API
   NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   ```

   **⚠️ Important:** The `SUPABASE_SERVICE_ROLE_KEY` is different from the anon/public key. Click "Reveal" on the `service_role` key in your dashboard.

4. **Run database migrations:**
   
   Your Supabase project should already have the migrations applied. If not:
   ```bash
   supabase db push
   ```

5. **Seed demo data:**
   ```bash
   npm run seed:catalog
   ```
   
   This creates:
   - 2 tax rules (VAT 20%, Sales Tax 8.5%)
   - 3 products with variants
   - 3 subscription plans
   - 4 discount codes
   - 2 quotation templates

6. **Start the development server:**
   ```bash
   npm run dev
   ```

7. **Open your browser:**
   ```
   http://localhost:3000
   ```

## 👥 User Roles & Permissions

### Admin
- Full access to all features
- User management and staff invitations
- Complete catalog configuration
- All subscription and billing operations
- Financial reports

### Internal Staff
- View product catalog and customers
- Create and manage quotes
- Manage subscriptions and invoicing
- Record verified payments
- Generate reports

### Customer
- Sign up and manage own profile
- View available products and plans
- View own subscriptions (when active)
- View and download own invoices
- Limited to own data only

### Password Requirements

All accounts must use passwords with:
- Minimum 9 characters
- At least one uppercase letter
- At least one lowercase letter
- At least one digit
- At least one special character

## 📦 Demo Data

After running `npm run seed:catalog`, you'll have:

### Products
| Product | Type | Base Price | Description |
|---------|------|------------|-------------|
| Cloud Platform | Software | $99/month | Professional cloud hosting platform |
| Premium Support | Service | $499/month | 24/7 dedicated support team |
| Extra Storage | Add-on | $19/month | 100GB additional storage per unit |

### Variants (for Cloud Platform)
- **Starter** - $79/month (5 users, 50GB storage)
- **Professional** - $99/month (25 users, 250GB storage)
- **Enterprise** - $499/month (unlimited users, 1TB storage, 99.99% SLA)

### Subscription Plans
- **Monthly Plan** - $99/month billing cycle
- **Annual Plan** - $990/year billing cycle
- **Support Monthly** - $499/month support plan

### Discount Codes
| Code | Type | Amount | Requirements |
|------|------|--------|--------------|
| WELCOME50 | Fixed | $50 off | Min $100 subtotal, 100 uses |
| SAVE100 | Fixed | $100 off | Min $500 subtotal, 50 uses |
| ANNUAL20 | Percentage | 20% off | No minimum |
| SAVE15 | Percentage | 15% off | No minimum |

## 🎯 User Workflows

### For New Users

1. **Sign Up** at `/signup`
   - Enter email and secure password
   - Confirm email (check your inbox)
   - Login at `/login`

2. **First Admin Setup** (one-time)
   - First user signs up as customer by default
   - Database admin manually promotes first admin account
   - Admin can then invite staff members

### For Admins

1. **Configure Catalog**
   - Navigate to `/catalog`
   - Create products, variants, plans
   - Set up tax rules and discounts

2. **Create Quotation Templates**
   - Go to `/quotation-templates`
   - Select a plan and add line items
   - Templates speed up quote creation

3. **Invite Staff**
   - Visit user management
   - Enter staff email and name
   - System sends invitation email

### For Staff

1. **Create Customer Quotes**
   - Select customer and template
   - Customize line items and pricing
   - Generate quotation PDF

2. **Manage Subscriptions**
   - Draft → Quotation → Confirm workflow
   - Activate on start date
   - Handle pause/resume/close requests

3. **Process Billing**
   - System generates invoices automatically
   - Review and confirm invoices
   - Record verified payments

### For Customers

1. **Browse Catalog** at `/portal/catalog`
   - View available products and plans
   - See current pricing and features

2. **View Subscriptions** at `/portal/subscriptions`
   - See active subscriptions
   - View billing schedule
   - Request changes (subject to plan rules)

3. **Manage Invoices** at `/portal/invoices`
   - View and download invoices
   - Check payment status
   - See payment history

## 🗂️ Project Structure

```
hack26/
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── (auth)/                   # Authentication pages
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   └── reset-password/
│   │   ├── (workspace)/              # Admin/Staff workspace
│   │   │   ├── catalog/
│   │   │   ├── subscriptions/
│   │   │   ├── invoices/
│   │   │   ├── payments/
│   │   │   └── reports/
│   │   ├── (portal)/                 # Customer portal
│   │   │   └── portal/
│   │   │       ├── catalog/
│   │   │       ├── subscriptions/
│   │   │       ├── invoices/
│   │   │       └── payments/
│   │   └── api/v1/                   # REST API routes
│   │       ├── me/
│   │       ├── customers/
│   │       ├── products/
│   │       ├── subscriptions/
│   │       ├── invoices/
│   │       └── payments/
│   ├── modules/                       # Feature modules
│   │   ├── identity/                 # Auth & user management (D1)
│   │   │   ├── contracts.ts          # Public types
│   │   │   ├── service.ts            # Server functions
│   │   │   └── components/
│   │   ├── catalog/                  # Products & pricing (D2)
│   │   │   ├── contracts.ts
│   │   │   ├── service.ts
│   │   │   └── components/
│   │   ├── subscriptions/            # Quotes & subscriptions (D3)
│   │   │   ├── contracts.ts
│   │   │   ├── service.ts
│   │   │   └── components/
│   │   └── billing/                  # Invoices & payments (D4)
│   │       ├── contracts.ts
│   │       ├── service.ts
│   │       └── components/
│   ├── lib/                          # Shared utilities
│   │   ├── supabase/                 # Supabase clients
│   │   │   ├── client.ts             # Browser client
│   │   │   ├── server.ts             # Server client
│   │   │   └── database.types.ts     # Generated types
│   │   ├── api/                      # API utilities
│   │   │   ├── contracts.ts          # Shared types
│   │   │   ├── errors.ts             # Error handling
│   │   │   └── idempotency.ts        # Retry safety
│   │   └── env/                      # Environment validation
│   └── components/                    # Shared UI components
│       └── ui/
├── supabase/
│   ├── migrations/                    # Database migrations
│   │   ├── 20261031050702_initial_schema.sql
│   │   ├── 20261031050705_initial_access_control.sql
│   │   ├── 20261031060015_identity_transactions.sql
│   │   ├── 20261031062224_require_invitation_claim.sql
│   │   ├── 20261031070000_billing_transaction_rpcs.sql
│   │   └── 20261031093401_implement_invoice_draft_pricing.sql
│   ├── tests/                        # SQL test suites
│   │   ├── initial-schema.sql
│   │   └── identity.sql
│   ├── config.toml                   # Local Supabase config
│   └── seed-simple.sql               # Alternative seed script
├── scripts/
│   ├── seed-catalog.ts               # Catalog seeding script
│   ├── seed-demo-data.ts             # Full demo data (WIP)
│   └── generate-db-types.mjs         # Type generation
├── tests/
│   ├── identity/                     # Identity tests
│   ├── subscriptions/                # Subscription tests
│   └── integration/                  # Integration tests
├── docs/
│   ├── architecture.md               # Architecture decisions
│   ├── database-schema.md            # Schema documentation
│   ├── api-contracts.md              # API specifications
│   ├── team-workstreams.md           # Development workflow
│   └── Subscription_Management_System.pdf
└── README.md                         # This file
```

## 🧪 Testing & Verification

### Type Checking
```bash
npm run typecheck
```
Validates TypeScript across the entire codebase.

### Linting
```bash
npm run lint
```
ESLint with Next.js rules.

### Build Verification
```bash
npm run build
```
Ensures production build succeeds.

### Database Tests
```bash
# Requires local Supabase running
npm run db:test           # Schema and RLS tests
npm run db:test:identity  # User management tests
npm run db:lint           # SQL linting
npm run db:advisors       # Performance recommendations
```

### Integration Tests
```bash
npm test                  # Run all tests
npm run test:watch        # Watch mode
npm run test:integration  # Integration suite
```

## 🔐 Security Features

### Authentication
- Email verification required
- Secure password hashing via Supabase Auth
- Session management with HTTP-only cookies
- Password reset with verified email flow
- Staff invitation-only (no public signup for internal roles)

### Authorization
- Row Level Security (RLS) on all tables
- Role-based access control (Admin/Staff/Customer)
- Resource ownership validation
- Active user checks on every request
- Last-admin protection (prevents locking out system)

### Data Protection
- Service role key never exposed to client
- CSRF protection on mutations
- Origin validation on API routes
- Input validation and sanitization
- SQL injection prevention via parameterized queries
- XSS prevention via React's built-in escaping

### Financial Security
- Money stored as integer minor units (cents)
- Idempotent operations prevent duplicate charges
- Concurrent payment protection (no overpayments)
- Discount usage limits enforced at database level
- Immutable financial records after confirmation
- Audit trails with versioning

### Privacy
- Customer data isolation (RLS enforced)
- No customer access to internal notes or costs
- Payment details excluded from responses
- Logs exclude PII and sensitive data
- Cache-Control: private, no-store on financial data

## 💰 Money & Pricing

### Currency Handling
- All amounts stored in **minor units** (cents)
- API accepts/returns decimal strings: `"99.00"` → `9900` internally
- Supports any ISO 4217 currency code (USD, EUR, GBP, etc.)
- Never mixes currencies in aggregations

### Price Calculation
```
Base Price: Product sales_price_minor
+ Variant Adjustment: variant.price_adjustment_minor
= Unit Price (must be ≥ 0)

Line Amount: unit_price * quantity
- Discount (proportionally allocated)
+ Tax (after discount)
= Total Line Amount
```

### Tax Rules
- Percentage-based (basis points: 10000 = 100%)
- One tax rule per product
- Effective date ranges
- Applied after discounts
- Snapshot at invoice time

### Discounts
- **Fixed:** Dollar amount off (capped at subtotal)
- **Percentage:** Percent off (basis points)
- Subscription-scoped or product-restricted
- Min quantity and subtotal requirements
- Start/end dates with usage limits
- Atomic redemption tracking

### Rounding
- Half-up rounding: `(amount * rate + 5000) / 10000`
- Performed once per line
- Integer arithmetic only (no floating point)
- Remainder cents allocated by UUID sort

## 🚦 Subscription Lifecycle

### States

```
draft → quotation → confirmed → active → closed
           ↓                       ↓
        revise                  paused
                                   ↓
                                active
```

### Workflow

1. **Draft** - Initial creation, fully editable
2. **Quotation** - Pricing locked, awaiting approval
3. **Confirmed** - Accepted by customer, awaiting start date
4. **Active** - Started, billing schedule running
5. **Paused** - Temporarily suspended (if plan allows)
6. **Closed** - Ended (manual or auto at expiry)

### Billing

- Automatic invoice generation at `next_billing_at`
- Billing intervals: daily, weekly, monthly, yearly
- Anchor date preservation (e.g., Jan 31 → Feb 28 → Mar 31)
- Leap day handling
- Missed period catch-up
- Paused time excluded from billing
- No billing past expiry

### Renewals

- Creates new draft subscription
- Links via `renewed_from_id`
- Original subscription remains closed
- Reprices at current plan rates
- One direct renewal per subscription

## 📊 Reporting

### Available Metrics

- **Active Subscriptions** - Current active count
- **Billed Revenue** - Total invoice amounts issued
- **Collected Revenue** - Total payments received
- **Outstanding Balance** - Unpaid invoice totals
- **Overdue** - Past due date with balance
- **Currency Buckets** - Separate totals per currency

### Filters

- Date range (from/to)
- Customer
- Invoice status
- Currency

### Reports

- Summary dashboard (`/reports/summary`)
- Customer-specific reports
- Export to CSV (planned)
- Custom date ranges

## 🛠️ Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run typecheck` | TypeScript type checking |
| `npm run lint` | ESLint code linting |
| `npm test` | Run all tests |
| `npm run test:watch` | Test watch mode |
| `npm run test:integration` | Integration test suite |
| `npm run seed:catalog` | Seed demo catalog data |
| `npm run seed:demo` | Seed full demo (users + data) |
| `npm run db:types` | Generate TypeScript types from schema |
| `npm run db:test` | Run SQL test suite |
| `npm run db:test:identity` | Run identity tests |
| `npm run db:lint` | Lint SQL migrations |
| `npm run db:advisors` | Get performance recommendations |

## 🚢 Deployment

### Vercel (Recommended)

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

2. **Import in Vercel:**
   - Go to [vercel.com](https://vercel.com)
   - Click "Import Project"
   - Select your GitHub repository
   - Vercel auto-detects Next.js

3. **Configure Environment Variables:**
   - Add the same variables from `.env.local`
   - Use your production Supabase project credentials
   - Never use local/development keys in production

4. **Deploy:**
   - Click "Deploy"
   - Vercel builds and deploys automatically
   - Each git push triggers a new deployment

### Environment Variables (Production)

```env
NEXT_PUBLIC_SUPABASE_URL=<production-supabase-url>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<production-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<production-service-role-key>
APP_ORIGIN=https://your-domain.com
BILLING_JOB_SECRET=<generate-secure-random-string>
```

### Database Migrations

Production migrations should be applied carefully:

1. Backup your database first
2. Test migrations on a staging environment
3. Review `supabase db push --dry-run`
4. Apply with `supabase db push`
5. Verify with smoke tests
6. Monitor for errors

## 📖 API Documentation

Complete API documentation is available in [docs/api-contracts.md](docs/api-contracts.md).

### Base URL
```
Production: https://your-domain.com/api/v1
Development: http://localhost:3000/api/v1
```

### Authentication
All endpoints (except auth) require a valid session cookie.

### Response Format

**Success (200/201):**
```json
{
  "data": { /* resource object */ },
  "request_id": "uuid"
}
```

**Error (4xx/5xx):**
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error",
    "fields": { "field_name": "error detail" }
  },
  "request_id": "uuid"
}
```

### Key Endpoints

- `GET /api/v1/me` - Current user profile
- `GET /api/v1/catalog` - Public catalog (customer-safe)
- `GET /api/v1/products` - All products (staff)
- `GET /api/v1/subscriptions` - List subscriptions
- `GET /api/v1/invoices` - List invoices
- `POST /api/v1/invoices/:id/payments` - Record payment

Full specifications: [docs/api-contracts.md](docs/api-contracts.md)

## 🤝 Contributing

This is a hackathon/demonstration project following strict architectural boundaries:

### Team Structure

- **D1 (Platform/Identity):** Auth, roles, shared libraries, database migrations, integration
- **D2 (Catalog/Pricing):** Products, variants, plans, tax rules, discounts, pricing logic
- **D3 (Subscriptions):** Quotation templates, subscription lifecycle, quote workflows
- **D4 (Billing/Payments):** Invoice generation, payment recording, reports, billing automation

### Development Rules

1. **Work only in assigned paths** - See [docs/team-workstreams.md](docs/team-workstreams.md)
2. **No cross-module edits** - Request changes through contracts
3. **No force pushes** - Preserve history on shared branches
4. **Migrations via D1 only** - Submit SQL proposals, don't create files
5. **Test before PR** - All checks must pass
6. **Document changes** - Update contracts when changing APIs

### Git Workflow

```bash
# Feature branches
git checkout -b feat/d2-product-variants

# Keep up to date
git fetch origin
git rebase origin/main

# Before opening PR
npm run typecheck
npm run lint
npm run build
npm test

# Open PR with:
# - Clear description of changes
# - Verification evidence
# - Contract updates (if applicable)
# - Known limitations
```

## 📚 Documentation

- **[Architecture](docs/architecture.md)** - Decisions, boundaries, security model
- **[Database Schema](docs/database-schema.md)** - Tables, migrations, RLS policies
- **[API Contracts](docs/api-contracts.md)** - HTTP endpoints, request/response formats
- **[Team Workstreams](docs/team-workstreams.md)** - Module ownership, integration plan
- **[Source Brief](docs/Subscription_Management_System.pdf)** - Original requirements

## ❓ Troubleshooting

### "Set NEXT_PUBLIC_SUPABASE_URL"

Your environment variables aren't loaded. Ensure `.env.local` exists with valid credentials.

### Can't login after signup

Check your email for verification link. For local development, check Supabase Inbucket at `http://localhost:54324`.

### Database connection errors

Verify your Supabase project is running and credentials are correct. For local: `supabase status`.

### RLS policy errors

The service role key bypasses RLS. Ensure you're using the correct key for server operations.

### Build errors after schema changes

Regenerate types: `npm run db:types`

### Test failures

Ensure local Supabase is running: `supabase start`

## 📝 License

Proprietary - Hack26 Team

## 🎉 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/) - React framework
- [Supabase](https://supabase.com/) - Backend-as-a-Service
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [PostgreSQL](https://www.postgresql.org/) - Database

---

**Project Status:** Foundation Complete (October 2026)  
**Current Phase:** Vertical slice implementation (D2-D4 modules)  
**Production Ready:** Database schema, Auth, RLS policies ✅  
**In Progress:** Subscription workflows, billing automation, customer portal

For questions or issues, see [docs/team-workstreams.md](docs/team-workstreams.md) for module ownership.

Built by the Hack26 team 🚀
