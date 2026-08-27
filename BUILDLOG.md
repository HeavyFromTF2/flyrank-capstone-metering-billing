# Build Log — AI usage

Honest account of where AI tools (Claude) helped, where they were wrong, and what was changed as a result, per
the brief's rule: "AI-assisted building is encouraged — and owned."

AI (Claude) was used as a learning and building tool across every phase, from the initial design doc onward —
not just for the later fixes. Roughly, by phase:

- **Phase 1 — design.** Worked through the schema with AI: `tenants` / `usage_events` /
  `processed_webhook_events`, why `idempotency_key` is `UNIQUE (tenant_id, idempotency_key)` rather than
  globally unique, and the decision to keep `plan` and `subscription_status` as columns on `tenants` instead of
  separate tables (documented as a deliberate scope choice in `README.md`). Also used it to sanity-check the
  Free/Pro limit numbers and the `/generate` API contract before writing any code.
- **Phase 2 — metering & quotas.** Built `meterService.js` (insert-then-catch-23505 pattern for idempotency)
  and `quotaService.js` (boundary check, `used + requestedQty <= limit`) with AI, then wrote
  `meterService.test.js` / `quotaService.test.js` against them. Also used AI to design the check order in
  `generate.js` — subscription status first (402) then quota (429) — matching the brief's distinction between
  "payment required" and "usage limit reached."
- **Phase 3 — Stripe integration.** Built `checkout.js` and `webhooks.js` (signature verification, dedup via
  `processed_webhook_events`, plan/status sync for the three event types) with AI, and tested the checkout →
  webhook → plan-flip flow for real using the Stripe CLI (`stripe trigger`, `stripe subscriptions cancel`) —
  not just by reading the code. `tests/webhooks.test.js` was added later with AI, using
  `stripe.webhooks.generateTestHeaderString` to sign a test payload locally instead of depending on a live
  `stripe listen` process during `npm test`. Splitting `index.js` into `app.js`/`index.js` was needed so
  `supertest` could import the Express app directly without it calling `app.listen()` on every test run.
- **Phase 4 — cost & finalization.** Built `pricingService.js` with AI (reasoning billed at the output rate,
  cached input priced separately, categories summed then rounded once) and its 6 pinned test cases. `GET
  /usage`, `scripts/seed.js`, `capstone.yaml`, and this documentation set were done in a later review pass with
  AI, after the core logic above was already built and manually tested.

## Where it was wrong, and what changed

1. **`tests/webhooks.test.js` failed with `Neither apiKey nor config.authenticator provided`.**
   The test file called `require('stripe')(process.env.STRIPE_SECRET_KEY)` on line 2, before
   `require('../src/app')` on line 3 — but `dotenv.config()` only runs inside `app.js`. Node evaluates
   `require`s in order, so the Stripe client was constructed with `STRIPE_SECRET_KEY` still `undefined`.
   **Fix:** added `require('dotenv').config()` as the first line of the test file, so env vars are loaded
   before anything tries to use them, regardless of what other files happen to load later.

2. **Cancelling a subscription left the tenant permanently blocked, even on the free plan.**
   The `customer.subscription.deleted` handler originally set `subscription_status = 'canceled'` when
   downgrading a tenant to `plan = 'free'`. But `/generate` requires `subscription_status === 'active'` for
   *every* request, regardless of plan — so a tenant who cancelled Pro would drop to Free and then get `402`
   forever, since nothing ever sets their status back to `active`. Caught this by re-reading the webhook
   handler against the quota-check logic in `generate.js` side by side, not by a failing test — there wasn't
   one covering this path.
   **Fix:** the cancellation handler now sets `subscription_status = 'active'` when downgrading to free, since
   the free plan doesn't require an active Stripe subscription to be usable. Documented the reasoning inline
   as a code comment so it doesn't look like an accidental copy-paste from the "upgrade" branch.

## What was checked, not just generated

- Every AI-written test was run against the real Postgres instance (via `stripe listen` + Docker), not accepted
  on the strength of the diff alone.
- Middleware ordering in `app.js` (webhook route mounted with `express.raw()` *before* the global
  `express.json()`) was checked against Stripe's own docs, since getting this backwards silently breaks
  signature verification with a confusing error.
