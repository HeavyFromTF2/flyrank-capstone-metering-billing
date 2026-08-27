const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../db/pool');

// express.raw() keeps the body as raw bytes — required for signature verification
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
    const signature = req.headers['stripe-signature'];
    let event;

    // Step 1: verify this request really came from Stripe (not forged)
    try {
        event = stripe.webhooks.constructEvent(req.body, signature, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Step 2: deduplication — has this exact event already been processed before?
    const alreadyProcessed = await pool.query(
        'SELECT 1 FROM processed_webhook_events WHERE stripe_event_id = $1',
        [event.id]
    );
    if (alreadyProcessed.rows.length > 0) {
        // Not an error — just acknowledge and do nothing, this is a Stripe retry/replay
        return res.status(200).json({ received: true, duplicate: true });
    }

    // Step 3: handle the event types we care about
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const tenantId = session.metadata?.tenantId;

        if (!tenantId) {
            console.warn('checkout.session.completed received without tenantId in metadata — skipping');
        } else {
            await pool.query('UPDATE tenants SET plan = $1 WHERE id = $2', ['pro', tenantId]);
            console.log(`Tenant ${tenantId} upgraded to pro`);
        }
    }

    if (event.type === 'customer.subscription.deleted') {
        // A subscription was cancelled — downgrade back to free
        // (Note: matching tenant to subscription needs stripe_subscription_id stored on the tenant —
        // we'll wire that up when we save it during checkout.session.completed)
    }

    // Step 4: mark this event as processed, so a retry of the same event is ignored
    await pool.query(
        'INSERT INTO processed_webhook_events (stripe_event_id) VALUES ($1)',
        [event.id]
    );

    res.status(200).json({ received: true });
});

module.exports = router;