# Usage Metering & Billing Engine

A small backend service that answers the three questions every SaaS product needs answered: how much has this
tenant used, what should they pay, and have they hit their plan's limit — with idempotent metering, honest quota
enforcement, correct money math, and signature-verified, deduplicated Stripe webhooks.

Built for the FlyRank Internship, Backend Track, Capstone.

## What it does

- **Meters usage** idempotently — the same request retried with the same `Idempotency-Key` records exactly one
  usage event, never two.
- **Enforces quotas** per tenant, per plan (Free / Pro), with honest status codes: `402` when the subscription
  itself isn't active, `429` when the plan's usage limit is reached.
- **Calculates cost** in integer cents — API calls at a flat rate, AI tokens with cached-input and
  reasoning-as-output pricing rules, pinned and tested.
- **Syncs subscriptions** through Stripe test-mode Checkout and signature-verified, deduplicated webhooks. Stripe
  is the source of truth for payment state; this service only mirrors it through verified events.

## Architecture

```
Client ──► POST /generate  (Idempotency-Key header, tenantId in body)
             │
             ├─► checkQuota(tenantId, 'api_call', qty)
             │     ├─ subscription not active? ──► 402 Payment Required
             │     └─ over plan limit?          ──► 429 Too Many Requests
             │
             └─► recordUsage(tenantId, 'api_call', qty, idempotencyKey)
                   ├─ duplicate key? ──► return the original event, no new row
                   └─ else ──► insert usage_event, return 201

Client ──► GET /usage?tenantId=...
             └─► checkQuota() x2 (api_call, ai_tokens) + pricingService
                   └─► { plan, subscriptionStatus, apiCalls: {used, limit, costCents}, aiTokens: {...} }

Client ──► POST /checkout  (tenantId)
             └─► Stripe Checkout Session (subscription mode, test mode) ──► checkoutUrl

Stripe ──signed webhook──► POST /webhooks/stripe
             ├─► verify signature (stripe.webhooks.constructEvent)      forged ──► 400
             ├─► dedupe by event.id against processed_webhook_events   replay ──► 200 { duplicate: true }
             ├─► checkout.session.completed        ──► tenant: plan='pro', subscription_status='active'
             ├─► customer.subscription.updated     ──► tenant: subscription_status = Stripe's status
             └─► customer.subscription.deleted     ──► tenant: plan='free', subscription_status='active'
```

**Layers:** `routes/` (HTTP, status codes) → `services/` (business rules: metering, quota, pricing) →
`db/pool.js` (Postgres). Pricing constants live in `config/pricing.js`, isolated from the calculation logic so
they can be pinned and tested independently.

## Data model

Deliberately small, matching the realistic scope in the brief — 2 plans, 2 usage types, no invoicing:

- **`tenants`** — `id`, `name`, `plan` (`free` | `pro`), `subscription_status`, `stripe_subscription_id`.
- **`usage_events`** — `id`, `tenant_id`, `type` (`api_call` | `ai_tokens`), `quantity`, `idempotency_key`
  (unique per tenant — this is what makes metering idempotent).
- **`processed_webhook_events`** — `stripe_event_id` (primary key) — this is what makes webhook handling
  idempotent.

**Design choice — no separate `plans`/`subscriptions` tables.** With only two fixed plans and no invoicing,
proration, or overage billing in scope, `plan` and `subscription_status` are columns on `tenants` rather than
their own tables. This keeps the schema proportional to what's actually being built; it would be the first
thing to normalize out if overage billing or a self-serve plan catalog were added later.

## Setup

Requires Docker, Node.js, and a free [Stripe](https://dashboard.stripe.com/register) test-mode account (no card).

```bash
# 1. Start Postgres
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# fill in STRIPE_SECRET_KEY (sk_test_...) and STRIPE_WEBHOOK_SECRET (whsec_...) from your Stripe dashboard

# 4. Apply the schema
docker exec -i billing_db psql -U billing -d billing_engine < src/db/schema.sql

# 5. Seed demo tenants (idempotent — safe to re-run)
npm run seed

# 6. In a separate terminal, forward Stripe webhooks to your local server
stripe listen --forward-to localhost:3000/webhooks/stripe
# copy the whsec_... it prints into your .env as STRIPE_WEBHOOK_SECRET, then restart step 7

# 7. Start the server
npm start

# 8. Run the test suite
npm test
```

Server runs at `http://localhost:3000`. `npm run seed` prints three tenant IDs to the console — use them for the
manual probes below (near-quota tenant, past-due tenant, fresh free tenant).

## API surface

| Method | Path              | Purpose                                                            |
|--------|-------------------|---------------------------------------------------------------------|
| POST   | `/generate`       | Dummy billable action. Requires `Idempotency-Key` header + `tenantId` in body. |
| GET    | `/usage`          | Rolls up this month's usage → `{ used, limit, costCents }` per type, for `?tenantId=`. |
| POST   | `/checkout`       | Creates a Stripe test-mode Checkout session for `tenantId` to upgrade to Pro. |
| POST   | `/webhooks/stripe`| Stripe webhook receiver — signature-verified, deduplicated.        |
| GET    | `/health`         | Liveness check.                                                     |

## Limitations (honest, on purpose)

- **No authentication.** `tenantId` is trusted as-is from the request body/query — there's no API key or session
  tying a caller to a tenant. Out of scope for this capstone's focus (metering/quota/billing correctness), but
  it's the first thing that would need to be added before this touched real traffic.
- **`ai_tokens` usage type is metered but no endpoint generates it yet.** `/generate` only records `api_call`
  events, so `GET /usage` will correctly show `aiTokens.used: 0` for any tenant until an AI-token-metering
  endpoint is added or events are inserted directly. The pricing math itself (cached input, reasoning-as-output)
  is fully implemented and pinned in `tests/pricingService.test.js`.
- **`GET /usage`'s `aiTokens.costCents` prices the entire used total at the `output` rate.** `usage_events`
  stores one flat `quantity` per event, not separate input/cachedInput/output/reasoning counts, so there's no way
  to split a historical total back into categories. This is a simplification for the rollup endpoint only — the
  category-aware calculation itself is correct and tested in isolation.
- **No invoicing, proration, or overage billing.** Per the brief's realistic-scope guidance — usage beyond the
  quota is rejected with `429`, not billed as an overage.

## AI usage

See [BUILDLOG.md](./BUILDLOG.md) for an honest account of where AI tools helped me out, where they were wrong, and what
was changed as a result. I did not blindly copy + paste what it sent me, I questioned it for what things did and I
tested it. I used it to learn from it.
