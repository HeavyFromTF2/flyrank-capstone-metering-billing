/*
 * Idempotent usage recording. Uniqueness is enforced at the DB level
 * (tenant_id + idempotency_key), not in application code.
 */

const pool = require('../db/pool');

// Records usage for a tenant. Same idempotencyKey twice = only 1 row ever created.
async function recordUsage(tenantId, type, quantity, idempotencyKey) {
  try {
    // Try to insert a new usage event
    const result = await pool.query(
      `INSERT INTO usage_events (tenant_id, type, quantity, idempotency_key)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [tenantId, type, quantity, idempotencyKey]
    );
    return { event: result.rows[0], wasNew: true };

  } catch (err) {
    // '23505' = duplicate key error (already exists in DB)
    if (err.code === '23505') {
      // Fetch the original event instead of creating a duplicate
      const existing = await pool.query(
        `SELECT * FROM usage_events WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, idempotencyKey]
      );
      return { event: existing.rows[0], wasNew: false };
    }
    throw err; // real error, don't hide it
  }
}

module.exports = { recordUsage };