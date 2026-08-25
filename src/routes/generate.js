const express = require('express');
const router = express.Router();
const { recordUsage } = require('../services/meterService');
const { checkQuota } = require('../services/quotaService');

router.post('/generate', async (req, res) => {
  const { tenantId, quantity = 1 } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  // Basic validation — both are required to process this request
  if (!tenantId || !idempotencyKey) {
    return res.status(400).json({ error: 'tenantId and Idempotency-Key header are required' });
  }

  // Check if this usage would exceed the tenant's plan quota
  const quota = await checkQuota(tenantId, 'api_call', quantity);

  if (!quota.allowed) {
    // 429 = "you've used too much, try again later / next month"
    return res.status(429).json({
      error: 'quota_exceeded',
      message: `Usage limit reached (${quota.used}/${quota.limit} this month). Upgrade your plan for more.`
    });
  }

  // Quota allows it — now record the usage (idempotent by design)
  const { event, wasNew } = await recordUsage(tenantId, 'api_call', quantity, idempotencyKey);

  // 201 = new event created, 200 = this was a retry of an existing event
  res.status(wasNew ? 201 : 200).json({ event, duplicate: !wasNew });
});

module.exports = router;