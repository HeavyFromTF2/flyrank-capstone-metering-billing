/*
 * Boundary test: 999 used + 1 more is allowed (exactly at the limit),
 * 1000 used + 1 more is blocked (one over).
 */

require('dotenv').config();
const pool = require('../src/db/pool');
const { recordUsage } = require('../src/services/meterService');
const { checkQuota } = require('../src/services/quotaService');

let testTenantId;

// Fresh tenant on the 'free' plan (limit: 1000 api_call) for this test file
beforeAll(async () => {
  const result = await pool.query(
    `INSERT INTO tenants (name, plan) VALUES ('Jest Quota Tenant', 'free') RETURNING id`
  );
  testTenantId = result.rows[0].id;
});

afterAll(async () => {
  await pool.query('DELETE FROM usage_events WHERE tenant_id = $1', [testTenantId]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  await pool.end();
});

test('quota allows usage right up to the limit, then blocks the next request', async () => {
  // Simulate 999 units already used, in one go
  await recordUsage(testTenantId, 'api_call', 999, 'seed-key-1');

  // At 999 used, requesting 1 more should be allowed (999 + 1 = 1000, exactly the limit)
  const atLimit = await checkQuota(testTenantId, 'api_call', 1);
  expect(atLimit.allowed).toBe(true);

  // Actually record that last unit, bringing total usage to exactly 1000
  await recordUsage(testTenantId, 'api_call', 1, 'seed-key-2');

  // Now at 1000 used, requesting even 1 more should be blocked (1000 + 1 > 1000)
  const overLimit = await checkQuota(testTenantId, 'api_call', 1);
  expect(overLimit.allowed).toBe(false);
  expect(overLimit.used).toBe(1000);
  expect(overLimit.limit).toBe(1000);
});