# Administrator console integration

## Delivered

Responsive, guarded administrator shell with grouped navigation, breadcrumbs, account menu, loading/error states and mobile drawer. Admin accounts landing at `/` go to `/admin/dashboard`; internal and customer routing remains intact.

33 routes: `/admin`, dashboard, reports, customers, customers/new, customers/[id], staff, staff/invite, staff/[id], roles, catalog, catalog/new, catalog/[id], pricing, pricing/[id], quotations, quotations/[id], subscriptions, subscriptions/[id], invoices, invoices/[id], payments, support, support/[id], audit-logs, notifications, system, settings, settings/business, settings/billing, settings/tax, settings/security and profile (all under `/admin`).

## Connected services

- D1 verified Auth/current active role through `requireActor` and `getMe`. Every protected data boundary requires admin; internal and customer accounts redirect to their own workspace.
- D1 customer/access directories and customer billing contacts. Profile editing reuses D1 ProfileForm.
- D1 staff invitations and access updates use the existing HTTP routes. Confirmation precedes submission. Access changes include the exact string version in If-Match, reject unverifiable responses and require reload after a conflict or uncertain outcome. No automatic mutation retries.
- D2 catalog services and CatalogManager, newly integrated from upstream main, provide product, variant, plan and tax configuration and discount reads. Admin catalog/new and pricing entry pages reuse that module, not a replacement pricing service. The first 100 records per category are explicitly identified.
- No backend service, migration, environment or dependency files were changed by this console implementation.

## Explicit boundaries and remaining work

D3/D4 public DTOs are imported for operational views, but request-scoped list/detail/lifecycle/payment application bindings remain unavailable. Those screens report unavailable data rather than fabricated records, balances or successful writes. No non-atomic financial writes were added.

Individual catalog/pricing detail lookup is not connected. Discount editing, reporting aggregation/export, support assignment, audit queries, notification persistence and global business/billing/security settings still need their owning service integrations. The system page is informational and omitted from navigation because no reliable health service exists. Disabled settings do not claim persistence.

Account detail lookup uses the selected directory batch and preserves its cursor. A direct link to an account outside the first batch needs navigation from that account's directory page; missing-in-batch is not presented as a global not-found result. Dashboard directory totals are only shown when the directory fits within one complete batch. Recent registrations are not labeled as audit events.

Catalog operations reuse D2's existing confirmation/error behavior. Full edit, archive confirmation and discount configuration UX remains dependent on the producer's component capabilities. Existing staff/customer unavailable adapters were not rewritten as part of this admin-only integration.

## Validation

- Clean `npm ci --no-audit --no-fund` passed in an isolated temporary copy; no user dev installation was replaced.
- Typecheck, lint and the final integrated production build passed (96 generated pages).
- Integrated suite: 201 Vitest tests plus 91 subscription tests, all passing (292 total).
- Production HTTP smoke before final catalog integration: 33 admin, 22 staff and 26 public/customer route checks passed (81 total). These check unauthenticated guards, not live administrator mutations.
- A static dashboard fixture was visually inspected at a narrow viewport. It uses fake accounts and is not a live authenticated browser test.
- No real invitation, access change, billing operation or catalog mutation was submitted during this task. Live administrator workflow verification remains outstanding; no administrator credentials were available.
- Codebase-memory tooling was unavailable; source and architecture documents were inspected directly.

## Change ownership

New frontend and tests live only in `src/app/admin`, `src/components/admin-console` and `tests/admin-console`. The sole existing source file edited is `src/app/page.tsx`, adding the admin landing redirect explicitly requested by the console brief. Upstream main changes were fast-forwarded and preserved. No D1-D4 module was edited.

## Exact changed-file inventory

- `src/app/admin/admin.css`
- `src/app/admin/audit-logs/page.tsx`
- `src/app/admin/catalog/[id]/page.tsx`
- `src/app/admin/catalog/new/page.tsx`
- `src/app/admin/catalog/page.tsx`
- `src/app/admin/customers/[id]/page.tsx`
- `src/app/admin/customers/new/page.tsx`
- `src/app/admin/customers/page.tsx`
- `src/app/admin/dashboard/page.tsx`
- `src/app/admin/error.tsx`
- `src/app/admin/invoices/[id]/page.tsx`
- `src/app/admin/invoices/page.tsx`
- `src/app/admin/layout.tsx`
- `src/app/admin/loading.tsx`
- `src/app/admin/not-found.tsx`
- `src/app/admin/notifications/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/admin/payments/page.tsx`
- `src/app/admin/pricing/[id]/page.tsx`
- `src/app/admin/pricing/page.tsx`
- `src/app/admin/profile/page.tsx`
- `src/app/admin/quotations/[id]/page.tsx`
- `src/app/admin/quotations/page.tsx`
- `src/app/admin/reports/page.tsx`
- `src/app/admin/roles/page.tsx`
- `src/app/admin/settings/billing/page.tsx`
- `src/app/admin/settings/business/page.tsx`
- `src/app/admin/settings/page.tsx`
- `src/app/admin/settings/security/page.tsx`
- `src/app/admin/settings/tax/page.tsx`
- `src/app/admin/staff/[id]/page.tsx`
- `src/app/admin/staff/invite/page.tsx`
- `src/app/admin/staff/page.tsx`
- `src/app/admin/subscriptions/[id]/page.tsx`
- `src/app/admin/subscriptions/page.tsx`
- `src/app/admin/support/[id]/page.tsx`
- `src/app/admin/support/page.tsx`
- `src/app/admin/system/page.tsx`
- `src/app/page.tsx`
- `src/components/admin-console/access-editor.tsx`
- `src/components/admin-console/catalog.tsx`
- `src/components/admin-console/confirm-dialog.tsx`
- `src/components/admin-console/dashboard.tsx`
- `src/components/admin-console/data.ts`
- `src/components/admin-console/directory-table.tsx`
- `src/components/admin-console/directory.tsx`
- `src/components/admin-console/identity-requests.ts`
- `src/components/admin-console/INTEGRATION.md`
- `src/components/admin-console/invite-form.tsx`
- `src/components/admin-console/monitoring.tsx`
- `src/components/admin-console/navigation.ts`
- `src/components/admin-console/operations.tsx`
- `src/components/admin-console/permissions.tsx`
- `src/components/admin-console/record-detail.tsx`
- `src/components/admin-console/related-tabs.tsx`
- `src/components/admin-console/reports.tsx`
- `src/components/admin-console/session.ts`
- `src/components/admin-console/settings.tsx`
- `src/components/admin-console/shell.tsx`
- `src/components/admin-console/ui.tsx`
- `tests/admin-console/catalog.test.ts`
- `tests/admin-console/dashboard.test.ts`
- `tests/admin-console/identity-requests.test.ts`
- `tests/admin-console/presentation.test.ts`
- `tests/admin-console/routes.mjs`
- `tests/admin-console/session.test.ts`

