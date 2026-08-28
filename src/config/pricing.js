/*
 * Pricing constants only — no calculation logic here, so the numbers can be
 * pinned and tested on their own (see tests/pricingService.test.js).
 */

// Prices as integers (cents per 1M tokens) — never floats, as the PDF rule says
const TOKENS_PER_MILLION = 1_000_000;

const TOKEN_PRICE_CENTS_PER_MILLION = {
  input: 300,       // fresh input tokens
  cachedInput: 100,  // cached input — cheaper
  output: 600        // output tokens (reasoning uses this same price, no separate entry)
};

const API_CALL_PRICE_CENTS = 1; // flat price per api_call

module.exports = { TOKENS_PER_MILLION, TOKEN_PRICE_CENTS_PER_MILLION, API_CALL_PRICE_CENTS };