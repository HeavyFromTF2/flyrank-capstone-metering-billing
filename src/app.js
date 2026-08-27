require('dotenv').config();

const express = require('express');
const app = express();

app.use('/', require('./routes/webhooks'));

app.use(express.json());
app.use('/', require('./routes/generate'));
app.use('/', require('./routes/checkout'));
app.use('/', require('./routes/usage'));

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