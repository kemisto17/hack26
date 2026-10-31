# Hack26 shared project instructions

These instructions apply to every contributor and agent, including Codex, OpenCode,
and Antigravity. Read this file and the four documents below before editing. Agent
configuration must reference this file; do not maintain competing project rules.

- [Architecture](docs/architecture.md): decisions, security, lifecycle, scope.
- [Database](docs/database-schema.md): authoritative schema and migration procedure.
- [Contracts](docs/api-contracts.md): shared HTTP and service interfaces.
- [Workstreams](docs/team-workstreams.md): exact ownership and integration order.
- Source brief: `docs/Subscription_Management_System.pdf` (four pages).

## Scope and ownership

Build one Next.js App Router / TypeScript / Tailwind application with Supabase Auth
and PostgreSQL. This baseline supplies architecture and database foundations, not
working product workflows. Do not claim a documented endpoint is implemented.

1. Work only in your assigned paths in `docs/team-workstreams.md`. **Never change,
   move, delete, reformat, or revert another developer's module without their explicit
   authorization.** Request the owning developer's change through the documented
   service contract. Record authorized cross-module changes in the PR.
2. D1 owns shared infrastructure and serializes every migration. D2-D4 propose SQL
   to D1; they must not create conflicting migrations or edit applied migrations.
   Rebase unmerged migration filenames/order with D1 before integration. Never
   rewrite migration history, reset a shared database, or drop production data.
3. **No undocumented API changes.** Change `docs/api-contracts.md` and the producing
   module's contract together, with producer and consumer review. Add compatible
   fields first; coordinate a later removal only after all callers migrate.
4. No force pushes (including `--force-with-lease`), history rewrites on shared
   branches, or overwriting others' work. Use short feature branches and reviewed
   PRs after this explicitly authorized baseline commit to `main`. Fetch before
   integrating; if `main` moved, preserve it and rerun affected checks.
5. Never commit secrets, `.env` files, database URLs with credentials, access tokens,
   production exports, or real customer data. Never put service credentials in
   `NEXT_PUBLIC_*`, client imports, logs, test snapshots, or API responses. Use fake
   fixtures. Revoke exposed secrets immediately; removing a file is insufficient.

## Security and correctness

- Supabase owns passwords, unique email accounts, confirmation and reset tokens.
  Enforce password length >= 9 with uppercase, lowercase and special character in
  both UI and Auth configuration. The selected built-in Auth policy also requires
  a digit; reflect that in UI/help text. Only admins can invite internal staff.
- Authorize each server operation using a verified Auth user and the current
  `public.users` role/active flag. Never trust role, owner, price, total, or payment
  confirmation supplied by the browser or user-editable Auth metadata.
- RLS is mandatory on every exposed table. Initial browser access is read-only;
  privileged writes run only through the responsible server service. A service key
  bypasses RLS: it is not authorization. Check role and ownership before using it.
- Keep money in integer minor units (API decimal strings); use integer/decimal
  arithmetic. Financial snapshots must survive catalog changes. Transactions and
  database uniqueness must protect invoicing, payments and discount usage against
  retries and concurrent requests. No sequence of independent REST writes for a
  multi-row financial operation.
- Keep authentication and customer data out of shared Next.js caches. Validate
  mutation Origin, session, input, and resource ownership server-side. Use safe
  DTOs; product cost and internal notes never reach customer clients.
- Do not remove validation, accessible labels/keyboard support, error handling,
  or tests to shorten implementation. Do not add speculative features/dependencies.

## Required checks

From the repository root (`hack26`, not its parent):

```sh
npm ci
npm run typecheck
npm run lint
npm run build
```

For schema changes, with Docker and Supabase CLI 2.122.0 available, use a disposable
local database (reset destroys that local database only):

```sh
supabase start
supabase db reset --local
supabase db query --local --file supabase/tests/initial-schema.sql
supabase db lint --local
supabase db advisors --local
```

Every nontrivial behavior change needs meaningful automated tests: success, invalid
input, forbidden roles/another customer's IDs, and the relevant boundary. Money
and state transitions additionally need rounding, concurrent retries, and rollback
tests. Schema changes must test RLS as actual `anon`/`authenticated` roles, FKs,
checks, uniqueness and retained data. Do not substitute snapshots or mocks of the
implementation for these checks. A workflow is not mergeable until its module has
the tests in `docs/team-workstreams.md`; add a test runner when that workflow is
implemented. Never mark an unavailable check as passing; report the limitation.

<!-- codebase-memory-mcp:start -->
For structural codebase exploration, use the installed `codebase-memory` skill.
Verify index coverage; read source directly for missing or stale coverage. If the
tool is unavailable in an agent, use source inspection and state that limitation.
<!-- codebase-memory-mcp:end -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
