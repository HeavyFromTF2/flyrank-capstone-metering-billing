/*
 * Reads a tenant's plan/status and this month's usage, and answers whether
 * a new request would fit under the plan limit. Doesn't write anything.
 */

const pool = require('../db/pool');

// Plan limits in one place
const LIMITS = {
  free: { api_call: 1000, ai_tokens: 100000 },
  pro:  { api_call: 100000, ai_tokens: 5000000 }
};

// Checks if a tenant can make this usage request without going over their plan limit
async function checkQuota(tenantId, type, requestedQty) {
  // Get the tenant's current plan AND subscription_status
  const tenantResult = await pool.query(
    'SELECT plan, subscription_status FROM tenants WHERE id = $1',
    [tenantId]
  );
  const { plan, subscription_status: subscriptionStatus } = tenantResult.rows[0];
  const limit = LIMITS[plan][type];

  // Sum how much this tenant already used this month
  const usageResult = await pool.query(
    `SELECT COALESCE(SUM(quantity), 0) AS used FROM usage_events
     WHERE tenant_id = $1 AND type = $2
     AND created_at >= date_trunc('month', now())`,
    [tenantId, type]
  );
  const used = parseInt(usageResult.rows[0].used, 10);

  // Would this request push them over the limit?
  const allowed = (used + requestedQty) <= limit;

  return { allowed, used, limit, plan, subscriptionStatus };
}

module.exports = { checkQuota, LIMITS };