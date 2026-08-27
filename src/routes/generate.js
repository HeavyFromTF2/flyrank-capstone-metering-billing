const express = require('express');
const router = express.Router();
const { recordUsage } = require('../services/meterService');
const { checkQuota } = require('../services/quotaService');

router.post('/generate', async (req, res) => {
  const { tenantId, quantity = 1 } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  if (!tenantId || !idempotencyKey) {
    return res.status(400).json({ error: 'tenantId and Idempotency-Key header are required' });
  }

  const quota = await checkQuota(tenantId, 'api_call', quantity);

  if (quota.subscriptionStatus !== 'active') {
    return res.status(402).json({
      error: 'payment_required',
      message: `Subscription is not active (status: ${quota.subscriptionStatus}). Update your payment method or resubscribe to continue.`
    });
  }

  if (!quota.allowed) {
    return res.status(429).json({
      error: 'quota_exceeded',
      message: `Usage limit reached (${quota.used}/${quota.limit} this month). Upgrade your plan for more.`
    });
  }

  const { event, wasNew } = await recordUsage(tenantId, 'api_call', quantity, idempotencyKey);

  res.status(wasNew ? 201 : 200).json({ event, duplicate: !wasNew });
});

module.exports = router;