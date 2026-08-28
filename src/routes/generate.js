/*
 * POST /generate — the one dummy billable endpoint. Order: subscription
 * status (402) is checked before quota (429), then the usage event is
 * recorded idempotently. Mirrors the flow in the architecture diagram.
 */

const express = require('express');
const router = express.Router();
const { recordUsage } = require('../services/meterService');
const { checkQuota } = require('../services/quotaService');

router.post('/generate', async (req, res) => {
  const { tenantId, quantity = 1 } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  // Idempotency-Key is required here, not optional — without it a retry
  // would just create a second usage event.
  if (!tenantId || !idempotencyKey) {
    return res.status(400).json({ error: 'tenantId and Idempotency-Key header are required' });
  }

  // One query gets used/limit/plan/subscriptionStatus together
  const quota = await checkQuota(tenantId, 'api_call', quantity);

  // Lapsed or cancelled subscription blocks the request before quota is even checked
  if (quota.subscriptionStatus !== 'active') {
    return res.status(402).json({
      error: 'payment_required',
      message: `Subscription is not active (status: ${quota.subscriptionStatus}). Update your payment method or resubscribe to continue.`
    });
  }

  // Over the plan's monthly limit
  if (!quota.allowed) {
    return res.status(429).json({
      error: 'quota_exceeded',
      message: `Usage limit reached (${quota.used}/${quota.limit} this month). Upgrade your plan for more.`
    });
  }

  // wasNew=false means this idempotencyKey was already used — event is the
  // original row, not a new one
  const { event, wasNew } = await recordUsage(tenantId, 'api_call', quantity, idempotencyKey);

  // 201 for a new event, 200 for a replay — same body either way
  res.status(wasNew ? 201 : 200).json({ event, duplicate: !wasNew });
});

module.exports = router;