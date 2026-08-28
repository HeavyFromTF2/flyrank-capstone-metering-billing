/*
 * Turns raw token/call counts into cents. Constants live in config/pricing.js
 * so they can be pinned and tested separately from this math.
 */

const { TOKENS_PER_MILLION, TOKEN_PRICE_CENTS_PER_MILLION, API_CALL_PRICE_CENTS } = require('../config/pricing');

// Converts token usage into cost in cents. Reasoning tokens are billed as output tokens.
function calculateTokenCostCents(tokens) {
  const input = tokens.input || 0;
  const cachedInput = tokens.cachedInput || 0;
  // reasoning has no price of its own — it's billed at the output rate, so we merge them here
  const billableOutput = (tokens.output || 0) + (tokens.reasoning || 0);

  // each category: (tokens used / 1,000,000) * price per 1M tokens
  // e.g. 1,000,000 input tokens * 300 cents/1M / 1,000,000 = 300 cents
  const rawCents =
    (input * TOKEN_PRICE_CENTS_PER_MILLION.input) / TOKENS_PER_MILLION +
    (cachedInput * TOKEN_PRICE_CENTS_PER_MILLION.cachedInput) / TOKENS_PER_MILLION +
    (billableOutput * TOKEN_PRICE_CENTS_PER_MILLION.output) / TOKENS_PER_MILLION;

  return Math.round(rawCents); // sum first, round once at the end — not per category
}

// Flat cost for N simple API calls
function calculateApiCallCostCents(quantity) {
  return quantity * API_CALL_PRICE_CENTS;
}

module.exports = { calculateTokenCostCents, calculateApiCallCostCents };