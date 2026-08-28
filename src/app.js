/*
 * Builds the Express app. No app.listen() here — that's index.js, so tests
 * can require this file and hit it with supertest without opening a port.
 */

require('dotenv').config();

const express = require('express');
const app = express();

// Mounted before express.json() on purpose: the Stripe webhook needs the raw
// request body for signature verification, not the parsed JSON.
app.use('/', require('./routes/webhooks'));

app.use(express.json());
app.use('/', require('./routes/generate'));
app.use('/', require('./routes/checkout'));
app.use('/', require('./routes/usage'));

// Stripe redirects here after checkout. The actual plan upgrade happens via
// the webhook, not this route — these are just landing pages for the user.
app.get('/checkout-success', (req, res) => {
  res.send(
    '<h1>Payment successful!</h1>' +
    '<p>Your subscription is being activated - this happens via a Stripe webhook, ' +
    'so wait a moment for it to show up. Check <code>GET /usage?tenantId=...</code> to confirm your plan updated to pro!</p>'
  );
});

app.get('/checkout-cancel', (req, res) => {
  res.send('<h1>Checkout cancelled</h1><p>No changes were made to your subscription.</p>');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

module.exports = app;