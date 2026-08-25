require('dotenv').config();
const pool = require('../src/db/pool');
const { recordUsage } = require('../src/services/meterService');

let testTenantId;

// Runs once before all tests in this file — creates a fresh tenant to test with
beforeAll(async () => {
  const result = await pool.query(
    `INSERT INTO tenants (name, plan) VALUES ('Jest Test Tenant', 'free') RETURNING id`
  );
  testTenantId = result.rows[0].id;
});

// Runs once after all tests — cleans up so we don't leave test data behind
afterAll(async () => {
  await pool.query('DELETE FROM usage_events WHERE tenant_id = $1', [testTenantId]);
  await pool.query('DELETE FROM tenants WHERE id = $1', [testTenantId]);
  await pool.end(); // closes the DB connection pool so Jest can exit cleanly
});

test('same idempotency key twice creates only one usage event', async () => {
  const key = 'jest-key-1';

  const first = await recordUsage(testTenantId, 'api_call', 1, key);
  const second = await recordUsage(testTenantId, 'api_call', 1, key);

  // First call should be new, second should be recognized as a duplicate
  expect(first.wasNew).toBe(true);
  expect(second.wasNew).toBe(false);

  // Both calls should point to the exact same event row
  expect(first.event.id).toBe(second.event.id);

  // Confirm there's really only 1 row in the DB for this key
  const count = await pool.query(
    'SELECT COUNT(*) FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2',
    [testTenantId, key]
  );
  expect(parseInt(count.rows[0].count, 10)).toBe(1);
});