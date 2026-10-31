# D1 development setup

Use Node 22.12+ (Node 24 recommended), `npm ci`, then `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. The test runner and aliases support every owned `tests/<module>` directory and colocated `*.test.ts` files. `npm run test:integration` runs explicit real-stack tests separately; it requires disposable development fixtures and never silently skips missing configuration.

After D3 landed on main, `npm test` also runs its existing native Node suite via
`npm run test:subscriptions`. D3 files are preserved unchanged; future D2/D4
TypeScript suites run through Vitest without additional package edits.

Set these values in an ignored root `.env.local` or deployment secrets. Never commit environment files, keys or Auth tokens:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Development API origin; HTTPS except loopback |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (legacy anon key accepted); never a secret/service key |
| `SUPABASE_SECRET_KEY` | Server-only secret key (legacy service-role key accepted) |
| `APP_ORIGIN` | Exact application origin, e.g. `http://localhost:3000`; used for mutation Origin validation and Auth redirects |
| `SUPABASE_PROJECT_REF` | Optional read-only hosted type-generation target; absence selects local |
| `HACK26_TEST_PROJECT_REF` | Explicit disposable development target for live tests; must match the URL and project ref |
| `BILLING_JOB_SECRET` | Separate server scheduler secret, at least 32 characters; required only by D4's future job endpoint |

Validation is lazy at the owning client boundary, so static builds do not need credentials. Browser environment reads use explicit `NEXT_PUBLIC_` references for Next.js inlining. Import `createBrowserSupabaseClient` from `src/lib/supabase/browser.ts` for Auth UI, `createSessionClient` from `server.ts` for RLS reads, and `createAdminClient` from `admin.ts` only inside authorized server services. Clients are created per server request. Sensitive modules import `server-only`.

Shared contracts live in `src/lib/api/contracts.ts`; services throw `AppError` from `errors.ts`. HTTP adapters use `successResponse`/`errorResponse`, which return private/no-store envelopes. The fingerprint helper accepts normalized, validated caller input; omit request keys, If-Match, generated values and mutable default resolution before calling it. It normalizes `*_minor` strings and `at`/`*_at` timestamps, preserves arrays, sorts object keys and rejects non-JSON/lossy numbers.

Generate database types with `npm run db:types` after applying reviewed migrations. Commit the generated output. Raw generated bigint columns use the generator's numeric type; API DTOs must serialize bigint values as decimal strings, preferably using transactional JSON RPC results with explicit text casts. Do not blindly expose database rows.

The CLI is pinned to 2.122.0. Local database checks require Docker: `npx supabase start`, `npx supabase db reset --local` (disposable local database only), `npm run db:test`, `npm run db:lint`, `npm run db:advisors`. A hosted development project requires human designation and a collision/history inspection before baseline application. Roll back app code and keep additive schema; do not drop stored data.

## Designated development database

The human authorized a new `hack26-dev` project in `kemisto`, Mumbai: `uoxyukraftquykqdeoty`. No other project is a migration target. Both baseline migrations were applied via CLI 2.122.0 after an empty-table/history inspection and dry run. Real Supabase schema/access assertions, database lint (public/private) and security advisors pass. Hosted Auth settings were pushed from `supabase/config.toml` after reviewing the configuration diff. Keys are saved only in ignored local configuration.

Performance advisors flag the baseline's separate staff/customer SELECT policies and unused indexes on this empty development database; these are not security failures. They also flag the invoice composite FK; its subscription-leading unique period index already supports parent lookups. Evaluate measured plans with D4 before adding a redundant wider index. Production mail, production callback URLs and production performance checks remain deployment requirements.

## Auth and identity release checks

The foundation is PR #1 (`feat/d1-foundation`). The later identity branch is
stacked on it. Signup/login/reset/password-update pages use Supabase Auth, with
server callback verification and current-profile authorization. Open the exact
`APP_ORIGIN` configured locally; a different localhost spelling intentionally
fails cookie-mutation Origin checks. D1 layouts/navigation are ready for D2–D4
routes, which those owners still need to supply.

`npm run build` precedes `npm run test:integration`. The live suite starts its own
Next production server on loopback port 3107, uses real Supabase Auth/PostgREST
and identity RPCs, and deletes only its UUID-labelled fake accounts afterward.
It needs CLI login for out-of-band fixture roles/cleanup. It refuses to run unless
the explicit test project ref matches both the development ref and API URL.
Run SQL suites and live tests sequentially: last-admin assertions intentionally
depend on an isolated set of admin fixtures. Do not run this suite on production.

For this designated hosted development project:

```sh
npx supabase db query --linked --project-ref uoxyukraftquykqdeoty --file supabase/tests/initial-schema.sql
npx supabase db query --linked --project-ref uoxyukraftquykqdeoty --file supabase/tests/identity.sql
npx supabase db lint --linked --project-ref uoxyukraftquykqdeoty --schema public,private --fail-on warning
```

Local equivalents use `npm run db:test` and `npm run db:test:identity`. Security
advisors may report an informational notice that private.staff_invitations has
RLS but no policy: this is intentional, denying ordinary JWT roles all ledger
access. It is unexposed and only service-role invoker RPCs/owned Auth triggers
write it. Do not add a public policy to silence the notice.

### Mail and first admin (remaining operator setup)

The human explicitly deferred SMTP. Free Supabase's default provider restricts
recipients and rejects custom email-template updates. Password policy, email
confirmation, disabled anonymous signup and exact development callback URLs are
configured; the committed templates must be pushed after custom SMTP is set up.
No claim is made that general signup/reset/invitation mail delivery is ready.
Default invite fragments are explicitly restored with Auth setSession, removed
from the URL immediately and verified with getUser before password updates.
PKCE and token-hash callbacks are supported; tokens never enter application DTOs.

When SMTP is configured, review `npx supabase config diff --project-ref <dev-ref>`
and push `supabase/config.toml` to upload the three templates. Production needs
its own exact HTTPS site/callback URLs and provider rate limits before exposure.
Live tests verify real confirmation/recovery/invitation tokens via admin-generated
links without sending mail; actual delivery is deliberately untested.

The first real admin is an audited out-of-band operator action after the chosen
person signs up and confirms email. Verify their Auth ID and email-confirmed
state, then promote that exact public.users ID through the development operator
connection. Never use an email-name rule, public promotion route or seed password.
Disposable test admins are removed; no permanent first admin was selected here.
