import test from 'node:test';
import assert from 'node:assert/strict';
import { TestClock, createUser, makeSignal, mockRes, setup } from './helpers.mjs';
import { consumeSignal } from '../../lib/kimi/alert-engine.js';
import { exportMessages, viewTranscript } from '../../lib/kimi/admin.js';
import { buildRollupForDay, getDashboard } from '../../lib/kimi/analytics.js';
import { getDelivery, queryAudit, queryEvents, resolveShortLink } from '../../lib/kimi/store.js';
import { requireAdmin, requireCron } from '../../lib/kimi/auth.js';
import { callbackToken } from '../../lib/kimi/crypto.js';
import statusWebhook from '../../pages/api/kimi/webhooks/status/[provider].js';
import transcriptRoute from '../../pages/api/admin/kimi/transcript.js';

const admin = { uid: 'admin_1', email: 'ops@kahf.test' };

test('every transcript view and export is written to the audit log first', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser();
  await consumeSignal(makeSignal());
  const res = await viewTranscript({ userId: 'user_a', actor: admin });
  assert.equal(res.messages.length, 1);
  await exportMessages({ userId: 'user_a', actor: admin });
  const audit = await queryAudit({ targetUserId: 'user_a' });
  assert.deepEqual(audit.map((a) => a.action).sort(), ['export_messages', 'view_transcript']);
  assert.ok(audit.every((a) => a.actor_email === 'ops@kahf.test' && a.created_at));
});

test('the transcript endpoint is admin-only', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  process.env.ADMIN_SECRET = 'top-secret';
  await createUser();
  const anon = mockRes();
  await transcriptRoute({ method: 'POST', headers: {}, body: { user_id: 'user_a' }, query: {} }, anon);
  // NODE_ENV=test is not production, so the dev header path stays closed without the header.
  assert.equal(anon.statusCode, 401);
  const ok = mockRes();
  await transcriptRoute({ method: 'POST', headers: { authorization: 'Bearer top-secret' }, body: { user_id: 'user_a' }, query: {} }, ok);
  assert.equal(ok.statusCode, 200);
  assert.equal((await queryAudit({ targetUserId: 'user_a' })).length, 1);
  delete process.env.ADMIN_SECRET;
});

test('admin and cron auth fail closed in production', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    await assert.rejects(() => requireAdmin({ headers: { 'x-kimi-dev-admin': '1' } }), /Admin sign-in required/);
    assert.throws(() => requireCron({ headers: {} }), /Unauthorized/);
    process.env.CRON_SECRET = 'cron-secret';
    assert.equal(requireCron({ headers: { authorization: 'Bearer cron-secret' } }), true);
  } finally {
    process.env.NODE_ENV = prevEnv;
    delete process.env.CRON_SECRET;
  }
});

test('short links track clicks on the delivery and redirect to the alert page', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  await consumeSignal(makeSignal());
  const code = provider.sent[0].text.match(/\/k\/([A-Za-z0-9]+)$/)[1];
  clock.advance(1000);
  const link = await resolveShortLink(code);
  assert.equal(link.target_path, '/kimi/alerts/CSX__2026-11-05');
  clock.advance(1000);
  await resolveShortLink(code);
  assert.ok((await getDelivery('CSX__2026-11-05', 'user_a')).clicked_at);
  const clicks = await queryEvents({ types: 'alert_link_clicked' });
  assert.equal(clicks.length, 2);
  assert.deepEqual(clicks.map((c) => c.properties.first_click), [true, false]);
});

test('delivery receipts mark alerts delivered and record signal-to-text latency', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  await consumeSignal(makeSignal());
  clock.advance(4000);
  const providerMessageId = provider.sent[0].providerMessageId;
  const body = JSON.stringify({ providerMessageId, status: 'delivered' });
  const bad = mockRes();
  await statusWebhook({ method: 'POST', query: { provider: 'mock', token: 'nope' }, headers: {}, url: '/x', rawBody: body }, bad);
  assert.equal(bad.statusCode, 401);
  const ok = mockRes();
  await statusWebhook({ method: 'POST', query: { provider: 'mock', token: callbackToken('mock') }, headers: { 'content-type': 'application/json' }, url: '/x', rawBody: body }, ok);
  assert.equal(ok.statusCode, 200);
  const delivery = await getDelivery('CSX__2026-11-05', 'user_a');
  assert.equal(delivery.status, 'delivered');
  assert.equal(delivery.signal_to_text_ms, 4000);
  assert.equal((await queryEvents({ types: 'alert_delivered' })).length, 1);
});

test('rollups count under every channel/plan/ticker key and the dashboard filters by them', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  setup({ clock });
  await createUser({ userId: 'pro_user', phone: '+14155550101', plan: 'pro' });
  await createUser({ userId: 'free_user', phone: '+14155550102', plan: 'free' });
  await consumeSignal(makeSignal());
  const rollup = await buildRollupForDay('2026-11-05');
  assert.equal(rollup.keys['*|*|*'].signals_received, 1);
  assert.equal(rollup.keys['*|*|*'].alerts_sent, 2);
  assert.equal(rollup.keys['*|pro|*'].alerts_sent, 1);
  assert.equal(rollup.keys['imessage|free|CSX'].alerts_sent, 1);
  assert.equal(rollup.keys['sms|pro|*'].signals_received, 1, 'signal-level events count under every key');

  const all = await getDashboard({ tab: 'overview', from: '2026-11-05', to: '2026-11-05' });
  assert.equal(all.data.kpis.find((k) => k.key === 'alerts_sent').value, 2);
  const pro = await getDashboard({ tab: 'overview', from: '2026-11-05', to: '2026-11-05', plan: 'pro' });
  assert.equal(pro.data.kpis.find((k) => k.key === 'alerts_sent').value, 1);
  const other = await getDashboard({ tab: 'alerts', from: '2026-11-05', to: '2026-11-05', ticker: 'NVDA' });
  assert.equal(other.data.totals.sent.value, 0);
  for (const tab of ['funnel', 'alerts', 'backtests', 'conversations', 'users', 'health']) {
    const res = await getDashboard({ tab, from: '2026-11-01', to: '2026-11-05' });
    assert.ok(res.data, tab);
  }
});
