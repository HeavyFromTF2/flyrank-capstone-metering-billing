/*
 * Idempotent demo-data seed. Creates 3 fixed tenants (near-quota, past-due,
 * fresh free) used for the manual probes in EVIDENCE.md and the demo.
 * Safe to re-run — wipes its own previous output first.
 */

require('dotenv').config();
const pool = require('../src/db/pool');

// Fixed, recognizable names so this script is safe to re-run: it wipes its
// own previous output before reseeding, instead of piling up duplicates.
const DEMO_NAMES = ['Demo — Near Quota', 'Demo — Past Due', 'Demo — Fresh Free'];

async function seed() {
  const existing = await pool.query('SELECT id FROM tenants WHERE name = ANY($1)', [DEMO_NAMES]);
  const existingIds = existing.rows.map(r => r.id);
  if (existingIds.length) {
    await pool.query('DELETE FROM usage_events WHERE tenant_id = ANY($1)', [existingIds]);
    await pool.query('DELETE FROM tenants WHERE id = ANY($1)', [existingIds]);
  }

  // Tenant 1: free plan, 999/1000 api_calls already used.
  // One more call lands exactly on the boundary; the call after that is the 429.
  const nearQuota = await pool.query(
    `INSERT INTO tenants (name, plan, subscription_status) VALUES ($1, 'free', 'active') RETURNING id`,
    [DEMO_NAMES[0]]
  );
  const nearQuotaId = nearQuota.rows[0].id;
  await pool.query(
    `INSERT INTO usage_events (tenant_id, type, quantity, idempotency_key)
     SELECT $1, 'api_call', 1, 'seed-near-quota-' || gs
     FROM generate_series(1, 999) AS gs`,
    [nearQuotaId]
  );

  // Tenant 2: free plan, but subscription_status = 'past_due'.
  // Simulates a lapsed payment — /generate should refuse with 402 before touching quota.
  const pastDue = await pool.query(
    `INSERT INTO tenants (name, plan, subscription_status) VALUES ($1, 'free', 'past_due') RETURNING id`,
    [DEMO_NAMES[1]]
  );

  // Tenant 3: fresh free tenant, no usage. Use this one for the Checkout -> webhook -> Pro demo.
  const fresh = await pool.query(
    `INSERT INTO tenants (name, plan, subscription_status) VALUES ($1, 'free', 'active') RETURNING id`,
    [DEMO_NAMES[2]]
  );

  console.log('Seeded demo tenants:');
  console.log(`  Near quota (999/1000 api_call used) -> ${nearQuotaId}`);
  console.log(`  Past due   (expect 402 on /generate) -> ${pastDue.rows[0].id}`);
  console.log(`  Fresh free (for the checkout demo)   -> ${fresh.rows[0].id}`);

  await pool.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});