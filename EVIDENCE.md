# Evidence

One proof per Definition-of-Done checkbox (§6 of the brief). All commands run on Windows cmd.exe against a
local server (`npm start`) with `stripe listen --forward-to localhost:3000/webhooks/stripe` running alongside.

Seeded demo tenants (`npm run seed`). This were the ones I used:
- Near quota (999/1000 api_call used): `eca477ab-457f-470b-b468-0b0681750320`
- Past due (expect 402 on /generate): `a2f6a85a-5c05-4bc4-a0a4-2fe4190b2adf`
- Fresh free (used for the checkout demo): `5279848d-4a37-456b-bd8f-37ee70227ebc`

---

## Metering

### ✅ A billable action creates exactly one usage event, even under retries — deduplicated by idempotency key.

### ✅ A test proves double-counting cannot happen.

```
npm test -- meterService.test.js
```
Part of the full run below — `meterService.test.js` PASSED.

Manual proof — same Idempotency-Key sent twice:
```
curl -s -X POST http://localhost:3000/generate -H "Content-Type: application/json" -H "Idempotency-Key: evidence-dup-001" -d "{\"tenantId\":\"5279848d-4a37-456b-bd8f-37ee70227ebc\",\"quantity\":1}"

curl -s -X POST http://localhost:3000/generate -H "Content-Type: application/json" -H "Idempotency-Key: evidence-dup-001" -d "{\"tenantId\":\"5279848d-4a37-456b-bd8f-37ee70227ebc\",\"quantity\":1}"
```
```
{"event":{"id":"6242cfe1-b82c-448a-ba22-166b1934ab44","tenant_id":"5279848d-4a37-456b-bd8f-37ee70227ebc","type":"api_call","quantity":1,"idempotency_key":"evidence-dup-001","created_at":"2026-08-27T23:04:08.890Z"},"duplicate":false}

{"event":{"id":"6242cfe1-b82c-448a-ba22-166b1934ab44","tenant_id":"5279848d-4a37-456b-bd8f-37ee70227ebc","type":"api_call","quantity":1,"idempotency_key":"evidence-dup-001","created_at":"2026-08-27T23:04:08.890Z"},"duplicate":true}
```
Same `event.id` both times, second response flagged `duplicate: true`, no second row created.

---

## Quotas

### ✅ Usage is checked against the tenant's plan; requests over the limit are rejected.

### ✅ Responses carry the correct status codes (429/402) and a message explaining why.

```
npm test -- quotaService.test.js
```
Part of the full run below — `quotaService.test.js` PASSED (boundary cases at 999 / 1000).

Manual proof — boundary, using the seeded near-quota tenant (999/1000 used):
```
curl -s -X POST http://localhost:3000/generate -H "Content-Type: application/json" -H "Idempotency-Key: evidence-boundary-1000" -d "{\"tenantId\":\"eca477ab-457f-470b-b468-0b0681750320\",\"quantity\":1}"
```
```
{"event":{"id":"4c6f38f0-18b8-4508-9140-e8a8298e0997","tenant_id":"eca477ab-457f-470b-b468-0b0681750320","type":"api_call","quantity":1,"idempotency_key":"evidence-boundary-1000","created_at":"2026-08-27T23:04:18.433Z"},"duplicate":false}
```
The 1000/1000 call — exactly on the boundary — succeeds.
```
curl -s -i -X POST http://localhost:3000/generate -H "Content-Type: application/json" -H "Idempotency-Key: evidence-boundary-1001" -d "{\"tenantId\":\"eca477ab-457f-470b-b468-0b0681750320\",\"quantity\":1}"
```
```
HTTP/1.1 429 Too Many Requests
Content-Type: application/json; charset=utf-8

{"error":"quota_exceeded","message":"Usage limit reached (1000/1000 this month). Upgrade your plan for more."}
```
The request past the boundary is rejected with the correct status code and an explanatory message.

Manual proof — 402 for a lapsed subscription, using the seeded past-due tenant:
```
curl -s -i -X POST http://localhost:3000/generate -H "Content-Type: application/json" -H "Idempotency-Key: evidence-402-001" -d "{\"tenantId\":\"a2f6a85a-5c05-4bc4-a0a4-2fe4190b2adf\",\"quantity\":1}"
```
```
HTTP/1.1 402 Payment Required
Content-Type: application/json; charset=utf-8

{"error":"payment_required","message":"Subscription is not active (status: past_due). Update your payment method or resubscribe to continue."}
```
No usage_events row was written for this tenant (request rejected before metering).

---

## Cost calculation

### ✅ Monthly usage rolls up into a cost figure per tenant.

### ✅ AI token pricing handles cached input tokens, reasoning tokens, and output pricing correctly.

### ✅ Pricing constants are pinned and covered by tests.

```
npm test -- pricingService.test.js
```
Part of the full run below — `pricingService.test.js` PASSED (all 6 pinned cases).

Manual proof — rollup for the near-quota tenant, after it hit its limit:
```
curl -s "http://localhost:3000/usage?tenantId=eca477ab-457f-470b-b468-0b0681750320"
```
```
{"plan":"free","subscriptionStatus":"active","apiCalls":{"used":1000,"limit":1000,"costCents":1000},"aiTokens":{"used":0,"limit":100000,"costCents":0}}
```

---

## Stripe integration

### ✅ Subscription checkout works end-to-end in Stripe test mode.

```
curl -s -X POST http://localhost:3000/checkout -H "Content-Type: application/json" -d "{\"tenantId\":\"5279848d-4a37-456b-bd8f-37ee70227ebc\"}"
```
```
{"checkoutUrl":"https://checkout.stripe.com/c/pay/cs_test_..."}
```
Paid with test card `4242 4242 4242 4242`. `stripe listen` showed `checkout.session.completed` delivered
with a `200` response.
```
curl -s "http://localhost:3000/usage?tenantId=5279848d-4a37-456b-bd8f-37ee70227ebc"
```
```
{"plan":"pro","subscriptionStatus":"active","apiCalls":{"used":1,"limit":100000,"costCents":1},"aiTokens":{"used":0,"limit":5000000,"costCents":0}}
```
Tenant flipped Free -> Pro purely from the webhook; `/usage` reflects the new (much higher) Pro limits.

**Post-cancellation regression check** (proves the Phase-3 fix — a cancelled tenant is NOT left permanently
blocked with 402):
```
stripe subscriptions cancel sub_1U9CMSIdLqjk1CotVHh8Z0Sj
```
`stripe listen` log confirmed `customer.subscription.deleted` delivered with `200` at 00:06:44.
```
curl -s -i -X POST http://localhost:3000/generate -H "Content-Type: application/json" -H "Idempotency-Key: evidence-postcancel-001" -d "{\"tenantId\":\"5279848d-4a37-456b-bd8f-37ee70227ebc\",\"quantity\":1}"
```
```
HTTP/1.1 201 Created

{"event":{"id":"2e62d704-ee98-4241-aa2b-afe512d20c38","tenant_id":"5279848d-4a37-456b-bd8f-37ee70227ebc","type":"api_call","quantity":1,"idempotency_key":"evidence-postcancel-001","created_at":"2026-08-27T23:06:50.694Z"},"duplicate":false}
```
`201`, not `402` — after cancellation the tenant is back on a usable free plan, as intended.

### ✅ Webhooks verify signatures, ignore duplicate events, and update tenant plan/status.

```
npm test -- webhooks.test.js
```
Part of the full run below — `webhooks.test.js` PASSED: invalid-signature test and same-event-id-twice
duplicate test both green (this is the authoritative proof of dedup-by-event-id; see note below on the
manual proof).

Manual proof — forged signature:
```
curl -s -i -X POST http://localhost:3000/webhooks/stripe -H "Content-Type: application/json" -H "stripe-signature: t=123,v1=fake_signature" -d "{\"id\":\"evt_fake\",\"type\":\"checkout.session.completed\"}"
```
```
HTTP/1.1 400 Bad Request

Webhook Error: No signatures found matching the expected signature for payload.
```

Manual proof — real event replayed (same event.id, not a fresh `stripe trigger`):
```
stripe events list --limit 1
```
```
{"id": "evt_1U9CPSIdLqjk1CotodA8wGDr", "type": "invoice_payment.paid", ...}
```
```
stripe events resend evt_1U9CPSIdLqjk1CotodA8wGDr
```
Server restarted cleanly beforehand; no error, no extra console output after the resend. Worth noting
honestly: this particular event type (`invoice_payment.paid`) has no dedicated handler in `webhooks.js`, so
it produces no console.log on *either* delivery — the silence alone doesn't visually distinguish "ignored as
duplicate" from "no handler for this type." The dedup check (`processed_webhook_events`) runs unconditionally
before any type-specific logic though, so the row-count check below is the unambiguous proof:
```
docker exec -it billing_db psql -U billing -d billing_engine -c "SELECT COUNT(*) FROM processed_webhook_events WHERE stripe_event_id = 'evt_1U9CPSIdLqjk1CotodA8wGDr';"
```
```
 count
-------
     1
(1 row)
```
Delivered twice (original + `stripe events resend`), only one row exists — the second delivery was correctly
recognized as a duplicate and never reprocessed.

This is exactly what `tests/webhooks.test.js` already asserts automatically (same event.id sent twice via
supertest, then `SELECT COUNT(*) ... = 1`), which is the authoritative, automated proof required by §6 — the
manual steps above are supplementary demo material.

---

## Data model, tests & documentation

### ✅ Database includes tenants, plans, subscriptions, and usage events; customer data isolated per tenant.

See `src/db/schema.sql` and the "Data model" section of `README.md` for the design (and the deliberate
simplification of plans/subscriptions into columns rather than separate tables).

### ✅ Tests cover: duplicate usage prevention, quota boundary cases, cost calculations, invalid-webhook rejection, duplicate-webhook handling.

```
npm test
```
```
PASS  tests/pricingService.test.js
PASS  tests/quotaService.test.js
PASS  tests/meterService.test.js
PASS  tests/webhooks.test.js

Test Suites: 4 passed, 4 total
Tests:       10 passed, 10 total
Snapshots:   0 total
Time:        1.5 s
```

### ✅ README + architecture diagram + setup instructions; submission-pack files are present.

`README.md`, `EVIDENCE.md` (this file), `BUILDLOG.md`, `capstone.yaml`, `.env.example` — all present at the repo's root.
