/*
 * GET /usage?tenantId=... — rolls up this month's usage into
 * { used, limit, cost } per usage type. Reuses checkQuota() rather than
 * writing a separate query.
 */

const express = require('express');
const router = express.Router();
const { checkQuota } = require('../services/quotaService');
const { calculateApiCallCostCents, calculateTokenCostCents } = require('../services/pricingService');

router.get('/usage', async (req, res) => {
  const { tenantId } = req.query;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId query param is required' });
  }

  // requestedQty=0 — we're not checking a new request, just reading used/limit,
  // so we reuse checkQuota's query with "add 0" and ignore the .allowed field
  const apiCalls = await checkQuota(tenantId, 'api_call', 0);
  const aiTokens = await checkQuota(tenantId, 'ai_tokens', 0);

  res.json({
    plan: apiCalls.plan,
    subscriptionStatus: apiCalls.subscriptionStatus,
    apiCalls: {
      used: apiCalls.used,
      limit: apiCalls.limit,
      costCents: calculateApiCallCostCents(apiCalls.used)
    },
    aiTokens: {
      used: aiTokens.used,
      limit: aiTokens.limit,
      // simplification: usage_events stores a flat quantity, not per-category
      // tokens, so we price the whole total at the 'output' rate as an estimate
      costCents: calculateTokenCostCents({ output: aiTokens.used })
    }
  });
});

module.exports = router;