# D1 development setup

Use Node 22.12+ (Node 24 recommended), `npm ci`, then `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`. The test runner and aliases support every owned `tests/<module>` directory and colocated `*.test.ts` files. `npm run test:integration` runs explicit real-stack tests separately; it requires disposable development fixtures and never silently skips missing configuration.

Set these values in an ignored root `.env.local` or deployment secrets. Never commit environment files, keys or Auth tokens:

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Development API origin; HTTPS except loopback |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key (legacy anon key accepted); never a secret/service key |
| `SUPABASE_SECRET_KEY` | Server-only secret key (legacy service-role key accepted) |
| `APP_ORIGIN` | Exact application origin, e.g. `http://localhost:3000`; used for mutation Origin validation and Auth redirects |
| `SUPABASE_PROJECT_REF` | Optional read-only hosted type-generation target; absence selects local |

Validation is lazy at the owning client boundary, so static builds do not need credentials. Browser environment reads use explicit `NEXT_PUBLIC_` references for Next.js inlining. Import `createBrowserSupabaseClient` from `src/lib/supabase/browser.ts` for Auth UI, `createSessionClient` from `server.ts` for RLS reads, and `createAdminClient` from `admin.ts` only inside authorized server services. Clients are created per server request. Sensitive modules import `server-only`.

Shared contracts live in `src/lib/api/contracts.ts`; services throw `AppError` from `errors.ts`. HTTP adapters use `successResponse`/`errorResponse`, which return private/no-store envelopes. The fingerprint helper accepts normalized, validated caller input; omit request keys, If-Match, generated values and mutable default resolution before calling it. It normalizes `*_minor` strings and `at`/`*_at` timestamps, preserves arrays, sorts object keys and rejects non-JSON/lossy numbers.

Generate database types with `npm run db:types` after applying reviewed migrations. Commit the generated output. Raw generated bigint columns use the generator's numeric type; API DTOs must serialize bigint values as decimal strings, preferably using transactional JSON RPC results with explicit text casts. Do not blindly expose database rows.

The CLI is pinned to 2.122.0. Local database checks require Docker: `npx supabase start`, `npx supabase db reset --local` (disposable local database only), `npm run db:test`, `npm run db:lint`, `npm run db:advisors`. A hosted development project requires human designation and a collision/history inspection before baseline application. Roll back app code and keep additive schema; do not drop stored data.

## Designated development database

The human authorized a new `hack26-dev` project in `kemisto`, Mumbai: `uoxyukraftquykqdeoty`. No other project is a migration target. Both baseline migrations were applied via CLI 2.122.0 after an empty-table/history inspection and dry run. Real Supabase schema/access assertions, database lint (public/private) and security advisors pass. Hosted Auth settings were pushed from `supabase/config.toml` after reviewing the configuration diff. Keys are saved only in ignored local configuration.

Performance advisors flag the baseline's separate staff/customer SELECT policies and unused indexes on this empty development database; these are not security failures. They also flag the invoice composite FK; its subscription-leading unique period index already supports parent lookups. Evaluate measured plans with D4 before adding a redundant wider index. Production mail, production callback URLs and production performance checks remain deployment requirements.
