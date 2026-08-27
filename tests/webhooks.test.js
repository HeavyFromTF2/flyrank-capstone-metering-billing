require('dotenv').config();

const request = require('supertest');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = require('../src/app');
const pool = require('../src/db/pool');

const TEST_EVENT_ID = 'evt_jest_dedup_test';

beforeAll(async () => {
  await pool.query('DELETE FROM processed_webhook_events WHERE stripe_event_id = $1', [TEST_EVENT_ID]);
});

afterAll(async () => {
  await pool.query('DELETE FROM processed_webhook_events WHERE stripe_event_id = $1', [TEST_EVENT_ID]);
  await pool.end();
});

test('rejects a webhook with an invalid signature', async () => {
  const res = await request(app)
    .post('/webhooks/stripe')
    .set('stripe-signature', 't=123,v1=fake_signature')
    .set('Content-Type', 'application/json')
    .send(JSON.stringify({ id: 'evt_fake', type: 'checkout.session.completed' }));

  expect(res.status).toBe(400);
});

test('processes a valid webhook once, ignores the exact replay', async () => {
  const payload = JSON.stringify({
    id: TEST_EVENT_ID,
    type: 'customer.subscription.updated',
    data: { object: { id: 'sub_does_not_exist', status: 'active' } }
  });

  const signature = stripe.webhooks.generateTestHeaderString({
    payload,
    secret: process.env.STRIPE_WEBHOOK_SECRET
  });

  const first = await request(app)
    .post('/webhooks/stripe')
    .set('stripe-signature', signature)
    .set('Content-Type', 'application/json')
    .send(payload);

  expect(first.status).toBe(200);
  expect(first.body.duplicate).toBeFalsy();

  const second = await request(app)
    .post('/webhooks/stripe')
    .set('stripe-signature', signature)
    .set('Content-Type', 'application/json')
    .send(payload);

  expect(second.status).toBe(200);
  expect(second.body.duplicate).toBe(true);

  const count = await pool.query(
    'SELECT COUNT(*) FROM processed_webhook_events WHERE stripe_event_id = $1',
    [TEST_EVENT_ID]
  );
  expect(parseInt(count.rows[0].count, 10)).toBe(1);
});