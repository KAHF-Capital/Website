import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { TestClock, createUser, flushBackgroundTasks, mockRes, setup } from './helpers.mjs';
import { SendblueProvider } from '../../lib/kimi/messaging/sendblue.js';
import { TwilioProvider, twilioSignature } from '../../lib/kimi/messaging/twilio.js';
import { processInbound } from '../../lib/kimi/inbound.js';
import { COL, queryEvents } from '../../lib/kimi/store.js';
import { getDb } from '../../lib/kimi/db.js';
import webhook from '../../pages/api/kimi/webhooks/[provider].js';

test('Sendblue: accepts the configured signing secret and rejects everything else', () => {
  const sb = new SendblueProvider({ webhookSecret: 'sb-secret' });
  const body = JSON.stringify({ content: 'hi', from_number: '+14155550101', message_handle: 'h1' });
  assert.equal(sb.verifySignature({ headers: { 'sb-signing-secret': 'sb-secret' }, rawBody: body }), true);
  assert.equal(sb.verifySignature({ headers: { 'sb-signing-secret': 'nope' }, rawBody: body }), false);
  assert.equal(sb.verifySignature({ headers: {}, rawBody: body }), false);
  const hmac = crypto.createHmac('sha256', 'sb-secret').update(body).digest('hex');
  assert.equal(sb.verifySignature({ headers: { 'x-sendblue-signature': hmac }, rawBody: body }), true);
  assert.equal(sb.verifySignature({ headers: { 'x-sendblue-signature': hmac }, rawBody: `${body} ` }), false);
  assert.equal(new SendblueProvider({ webhookSecret: '' }).verifySignature({ headers: { 'sb-signing-secret': '' }, rawBody: body }), false);
  const parsed = sb.parseInbound({ body: JSON.parse(body) });
  assert.deepEqual([parsed.providerMessageId, parsed.from, parsed.text], ['h1', '+14155550101', 'hi']);
});

test('Twilio: validates X-Twilio-Signature over the URL and sorted params', () => {
  const tw = new TwilioProvider({ accountSid: 'AC1', authToken: 'tw-token', fromNumber: '+18885550100' });
  const params = { AccountSid: 'AC1', From: '+14155550101', Body: 'hi', MessageSid: 'SM1' };
  const url = 'https://kimi.test/api/kimi/webhooks/twilio';
  const signature = twilioSignature('tw-token', url, params);
  const req = { headers: { 'x-twilio-signature': signature, host: 'kimi.test', 'x-forwarded-proto': 'https' }, url: '/api/kimi/webhooks/twilio', body: params };
  assert.equal(tw.verifySignature(req), true);
  assert.equal(tw.verifySignature({ ...req, body: { ...params, Body: 'tampered' } }), false);
  assert.equal(tw.verifySignature({ ...req, body: { ...params, AccountSid: 'AC2' } }), false);
  assert.equal(tw.verifySignature({ ...req, headers: { host: 'kimi.test' } }), false);
});

function webhookReq(body, headers = {}) {
  return {
    method: 'POST',
    query: { provider: 'mock' },
    url: '/api/kimi/webhooks/mock',
    headers: { 'content-type': 'application/json', ...headers },
    rawBody: JSON.stringify(body)
  };
}

test('the webhook rejects unsigned requests', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  const res = mockRes();
  await webhook(webhookReq({ providerMessageId: 'x1', from: '+14155550101', text: 'hi' }), res);
  assert.equal(res.statusCode, 401);
  await flushBackgroundTasks();
  assert.equal((await queryEvents({ types: 'webhook_rejected' })).length, 1);
});

test('the webhook acks quickly and processes each provider message exactly once', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser();
  const body = { providerMessageId: 'retry-1', from: '+14155550101', text: 'MORE' };
  const signed = { 'x-kimi-mock-signature': 'test-secret' };

  const started = Date.now();
  const res1 = mockRes();
  await webhook(webhookReq(body, signed), res1);
  assert.equal(res1.statusCode, 200);
  assert.ok(Date.now() - started < 1000, 'responds within a second');

  const res2 = mockRes();
  await webhook(webhookReq(body, signed), res2);
  assert.equal(res2.statusCode, 200);
  await flushBackgroundTasks();

  const jobs = await getDb().query(COL.jobs);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'done');
  const inboundMsgs = (await getDb().query(COL.messages)).filter((m) => m.direction === 'inbound');
  assert.equal(inboundMsgs.length, 1);
  assert.equal(provider.sent.length, 1, 'one reply despite the provider retry');
});

test('processing is idempotent even if the same message reaches the pipeline twice', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser();
  const msg = { providerMessageId: 'dup-1', from: '+14155550101', text: 'HELP', media: [], channel: 'imessage' };
  await processInbound({ adapter: provider, inbound: msg });
  const second = await processInbound({ adapter: provider, inbound: msg });
  assert.equal(second.status, 'duplicate');
  assert.equal(provider.sent.length, 1);
});

test('unknown numbers get only a signup link, at most once per 24h', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  const from = '+16465550123';
  const r1 = await processInbound({ adapter: provider, inbound: { providerMessageId: 'u1', from, text: 'what is $NVDA doing', media: [] } });
  assert.equal(r1.status, 'unknown_sender_replied');
  assert.equal(provider.sent.length, 1);
  assert.match(provider.sent[0].text, /https:\/\/kimi\.test\/kimi/);

  clock.advance(3 * 3600000);
  const r2 = await processInbound({ adapter: provider, inbound: { providerMessageId: 'u2', from, text: 'hello??', media: [] } });
  assert.equal(r2.status, 'unknown_sender_suppressed');
  assert.equal(provider.sent.length, 1);

  clock.advance(22 * 3600000);
  await processInbound({ adapter: provider, inbound: { providerMessageId: 'u3', from, text: 'hi', media: [] } });
  assert.equal(provider.sent.length, 2);
  const toolCalls = await getDb().query(COL.toolCalls);
  assert.equal(toolCalls.length, 0, 'unknown numbers never reach tools');
});

test('verified numbers without consent are treated as unknown', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  const profile = await createUser();
  await getDb().update(COL.profiles, profile.user_id, { consent_at: null, sms_enabled: false });
  const r = await processInbound({ adapter: provider, inbound: { providerMessageId: 'nc1', from: '+14155550101', text: 'MORE', media: [] } });
  assert.equal(r.status, 'unknown_sender_replied');
});
