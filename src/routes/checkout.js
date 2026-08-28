/*
 * POST /checkout — creates a Stripe Checkout session so a tenant can
 * upgrade to Pro. Doesn't touch the tenant's plan directly; that only
 * happens once the checkout.session.completed webhook arrives.
 */

const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

router.post('/checkout', async (req, res) => {
  const { tenantId } = req.body;

  if (!tenantId) {
    return res.status(400).json({ error: 'tenantId is required' });
  }

  // A Checkout Session is Stripe's hosted payment page — we just tell it
  // what to sell and where to send the customer after
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: { name: 'Pro Plan' },
          unit_amount: 2000, // $20.00, in cents — never use floats for money
          recurring: { interval: 'month' },
        },
        quantity: 1,
      },
    ],
    // Stashing tenantId here so the webhook later knows which tenant to update
    metadata: { tenantId },
    success_url: 'http://localhost:3000/checkout-success',
    cancel_url: 'http://localhost:3000/checkout-cancel',
  });

  res.json({ checkoutUrl: session.url });
});

module.exports = router;