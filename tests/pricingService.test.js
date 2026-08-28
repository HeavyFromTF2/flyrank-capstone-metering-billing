/*
 * Pinned cost-math tests — expected values are hand-calculated, not derived
 * from the code under test, so a wrong implementation can't pass by copying itself.
 */

const { calculateTokenCostCents, calculateApiCallCostCents } = require('../src/services/pricingService');

// Pinned values — hand-calculated, not derived from the code itself
test('prices input tokens alone', () => {
  expect(calculateTokenCostCents({ input: 1_000_000 })).toBe(300);
});

test('prices cachedInput tokens cheaper than input', () => {
  expect(calculateTokenCostCents({ cachedInput: 1_000_000 })).toBe(100);
});

test('reasoning tokens are billed at the output rate, not a separate price', () => {
  expect(calculateTokenCostCents({ output: 500_000, reasoning: 500_000 })).toBe(600);
});

test('combines all categories correctly', () => {
  const result = calculateTokenCostCents({
    input: 1_000_000,
    cachedInput: 1_000_000,
    output: 500_000,
    reasoning: 500_000
  });
  expect(result).toBe(1000); // 300 + 100 + 600
});

test('missing categories default to 0', () => {
  expect(calculateTokenCostCents({})).toBe(0);
});

test('api_call cost is flat per call', () => {
  expect(calculateApiCallCostCents(10)).toBe(10);
});