const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const pool = require('../db/pool');

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
        return res.status(200).json({ received: true, duplicate: true });
    }

    // Step 3a: checkout finished — upgrade the tenant and remember their subscription id
    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const tenantId = session.metadata?.tenantId;

        if (!tenantId) {
            console.warn('checkout.session.completed received without tenantId in metadata — skipping');
        } else {
            // Saving subscription id here so later events (updated/deleted) can find this tenant
            await pool.query(
                'UPDATE tenants SET plan = $1, subscription_status = $2, stripe_subscription_id = $3 WHERE id = $4',
                ['pro', 'active', session.subscription, tenantId]
            );
            console.log(`Tenant ${tenantId} upgraded to pro`);
        }
    }

    // Step 3b: subscription changed (payment failed, renewed, etc.) — mirror Stripe's status
    if (event.type === 'customer.subscription.updated') {
        const subscription = event.data.object;

        // No tenantId in this event, so look up the tenant by the subscription id we saved earlier
        const result = await pool.query(
            'UPDATE tenants SET subscription_status = $1 WHERE stripe_subscription_id = $2 RETURNING id',
            [subscription.status, subscription.id]
        );

        if (result.rows.length === 0) {
            console.warn(`subscription.updated for unknown subscription ${subscription.id} — skipping`);
        } else {
            console.log(`Tenant ${result.rows[0].id} subscription status updated to ${subscription.status}`);
        }
    }

    // Step 3c: subscription cancelled — downgrade the tenant back to free
    if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object;

        // subscription_status = 'active' here on purpose: the free plan doesn't
        // require a Stripe subscription, so cancellation should return the tenant
        // to a normal, usable free tier — not leave them permanently 402'd.
        const result = await pool.query(
            `UPDATE tenants SET plan = 'free', subscription_status = 'active', stripe_subscription_id = NULL
             WHERE stripe_subscription_id = $1 RETURNING id`,
            [subscription.id]
        );

        if (result.rows.length === 0) {
            console.warn(`subscription.deleted for unknown subscription ${subscription.id} — skipping`);
        } else {
            console.log(`Tenant ${result.rows[0].id} downgraded to free (subscription cancelled)`);
        }
    }

    // Step 4: mark this event as processed, so a retry of the same event is ignored
    await pool.query(
        'INSERT INTO processed_webhook_events (stripe_event_id) VALUES ($1)',
        [event.id]
    );

    res.status(200).json({ received: true });
});

module.exports = router;