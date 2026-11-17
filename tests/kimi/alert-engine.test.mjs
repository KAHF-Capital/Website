import test from 'node:test';
import assert from 'node:assert/strict';
import { TestClock, createUser, makeSignal, setup, signalIdOf } from './helpers.mjs';
import { consumeSignal, flushDigests, pollSignals, reconcileRetractions } from '../../lib/kimi/alert-engine.js';
import { getAlert, getDelivery, getSystemState, listUserMessages, queryEvents, setSystemOverrides } from '../../lib/kimi/store.js';
import { backend } from '../../lib/kimi/backend.js';

const T0 = '2026-11-05T15:00:00Z'; // Thursday 10:00 ET

test('a backend signal produces one alert per eligible user, exactly once', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser({ userId: 'a', phone: '+14155550101' });
  await createUser({ userId: 'b', phone: '+14155550102' });
  const read = makeSignal();

  const first = await consumeSignal(read, { paramVersion: 'v1' });
  assert.equal(first.status, 'active');
  assert.equal(first.sent, 2);
  assert.equal(provider.sent.length, 2);
  assert.match(provider.sent[0].text, /^Kaia: \$CSX dark pool print/);
  assert.match(provider.sent[0].text, /https:\/\/kimi\.test\/k\/[A-Za-z0-9]+$/);

  clock.advance(60000);
  const again = await consumeSignal(read, { paramVersion: 'v1' });
  assert.equal(again.alreadyProcessed, true);
  assert.equal(provider.sent.length, 2, 'replaying the same signal id sends nothing');

  const alert = await getAlert(signalIdOf(read));
  assert.equal(alert.id, 'CSX__2026-11-05');
  assert.deepEqual(alert.signal_payload, read, 'payload stored unmodified');
  assert.equal(alert.backend_param_version, 'v1');
  const delivery = await getDelivery(alert.id, 'a');
  assert.equal(delivery.status, 'sent');
  assert.ok(delivery.short_code);
});

test('polling the feed processes each signal id once even if it appears twice', async () => {
  const clock = new TestClock(T0);
  const read = makeSignal();
  const { provider } = setup({ clock, backend: { signals: [read, { ...read }] } });
  await createUser();
  const res = await pollSignals();
  assert.equal(res.new, 1);
  assert.equal(provider.sent.length, 1);
  clock.advance(5 * 60000);
  const again = await pollSignals();
  assert.equal(again.new, 0);
  assert.equal(provider.sent.length, 1);
});

test('Kimi applies no signal thresholds of its own', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser();
  // Below anything the backend would flag; Kimi still delivers what the backend published.
  await consumeSignal(makeSignal({ ticker: 'TINY', volume_ratio: 0.4, dark_pool_value: 1000, asof_hit_rate: 5 }));
  assert.equal(provider.sent.length, 1);
});

test('stale signals are skipped and suppressed with reason "stale"', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser();
  const read = makeSignal({ found_at: new Date(Date.parse(T0) - 3 * 3600000).toISOString() });
  const res = await consumeSignal(read);
  assert.equal(res.status, 'stale');
  assert.equal(provider.sent.length, 0);
  const delivery = await getDelivery(signalIdOf(read), 'user_a');
  assert.equal(delivery.status, 'suppressed');
  assert.equal(delivery.suppression_reason, 'stale');
  assert.equal((await queryEvents({ types: 'signal_stale' })).length, 1);
});

test('retracted signals are never sent', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser();
  const res = await consumeSignal(makeSignal({ retracted: true }));
  assert.equal(res.status, 'retracted');
  assert.equal(provider.sent.length, 0);
});

test('a signal removed from the backend feed is retracted and queued digests are cancelled', async () => {
  const clock = new TestClock(T0);
  const read = makeSignal();
  const state = { signals: [read] };
  const { provider } = setup({ clock, backend: state });
  await createUser({ prefs: { digest: { enabled: true, interval_minutes: 30 } } });
  await pollSignals();
  assert.equal((await getDelivery(signalIdOf(read), 'user_a')).status, 'queued_digest');

  clock.advance(10 * 60000);
  state.signals = [];
  state.generatedAt = new Date(clock.now).toISOString();
  const feed = await backend().loadPublishedSignals();
  const res = await reconcileRetractions(feed);
  assert.equal(res.retracted, 1);
  assert.equal((await getAlert(signalIdOf(read))).status, 'retracted');
  const delivery = await getDelivery(signalIdOf(read), 'user_a');
  assert.equal(delivery.status, 'suppressed');
  assert.equal(delivery.suppression_reason, 'retracted');

  clock.advance(60 * 60000);
  await flushDigests();
  assert.equal(provider.sent.length, 0);
});

test('the retraction guard ignores a feed that dropped most active signals', async () => {
  const clock = new TestClock(T0);
  const signals = ['AAA', 'BBB', 'CCC', 'DDD', 'EEE', 'FFF', 'GGG', 'HHH'].map((ticker) => makeSignal({ ticker }));
  const state = { signals };
  setup({ clock, backend: state });
  await pollSignals();
  clock.advance(60000);
  state.signals = signals.slice(0, 1);
  state.generatedAt = new Date(clock.now).toISOString();
  const res = await reconcileRetractions(await backend().loadPublishedSignals());
  assert.equal(res.skipped, 'guard');
});

test('signals rejected by the backend\'s own publish filters are retracted', async () => {
  const clock = new TestClock(T0);
  const read = makeSignal();
  const state = { signals: [read] };
  setup({ clock, backend: state });
  await pollSignals();
  state.signals = [];
  state.rejected = [{ id: signalIdOf(read), reason: 'excluded_ticker' }];
  state.generatedAt = '2026-01-01T00:00:00Z';
  const res = await reconcileRetractions(await backend().loadPublishedSignals());
  assert.equal(res.retracted, 1);
  assert.equal((await getAlert(signalIdOf(read))).retraction_reason, 'excluded_ticker');
});

test('a revised payload for the same id is recorded but not re-sent', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser();
  const read = makeSignal();
  await consumeSignal(read);
  clock.advance(60000);
  await consumeSignal({ ...read, entry_premium: 2.75 });
  const alert = await getAlert(signalIdOf(read));
  assert.equal(alert.signal_payload.entry_premium, 2.75);
  assert.equal(alert.revisions.length, 1);
  assert.equal(provider.sent.length, 1);
  assert.equal((await queryEvents({ types: 'signal_revised' })).length, 1);
});

test('fan-out applies caps and same-ticker dedupe and records the reasons', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser();
  await consumeSignal(makeSignal({ ticker: 'CSX', date: '2026-11-04' }));
  clock.advance(5 * 60000);
  await consumeSignal(makeSignal({ ticker: 'CSX', date: '2026-11-05', found_at: new Date(clock.now).toISOString() }));
  clock.advance(5 * 60000);
  await consumeSignal(makeSignal({ ticker: 'GL', found_at: new Date(clock.now).toISOString() }));
  clock.advance(5 * 60000);
  await consumeSignal(makeSignal({ ticker: 'NVDA', found_at: new Date(clock.now).toISOString() }));

  assert.equal(provider.sent.length, 2);
  assert.equal((await getDelivery('CSX__2026-11-05', 'user_a')).suppression_reason, 'dedupe');
  const capped = await getDelivery('NVDA__2026-11-05', 'user_a');
  assert.equal(capped.suppression_reason, 'cap');
  assert.equal(capped.cap_window, 'hour');
});

test('digest mode bundles alerts into one text when the window closes', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock });
  await createUser({ prefs: { digest: { enabled: true, interval_minutes: 30 } } });
  await consumeSignal(makeSignal({ ticker: 'CSX' }));
  clock.advance(5 * 60000);
  await consumeSignal(makeSignal({ ticker: 'GL', dark_pool_value: 297e6, volume_ratio: 12.09, found_at: new Date(clock.now).toISOString() }));
  assert.equal(provider.sent.length, 0);

  clock.advance(10 * 60000);
  assert.equal((await flushDigests()).sent, 0, 'window still open');

  clock.advance(20 * 60000);
  const out = await flushDigests();
  assert.equal(out.sent, 2);
  assert.equal(provider.sent.length, 1);
  assert.match(provider.sent[0].text, /^Kaia digest: 2 dark pool signals\. \$CSX \$630M 3\.0x; \$GL \$297M 12\.1x\./);
  assert.equal((await getDelivery('GL__2026-11-05', 'user_a')).digest, true);
});

test('the kill switch stops alert sends; the dashboard override can turn alerts back on', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock, alertsEnabled: false });
  await createUser();
  await consumeSignal(makeSignal());
  assert.equal(provider.sent.length, 0);
  assert.equal((await getDelivery('CSX__2026-11-05', 'user_a')).suppression_reason, 'kill_switch');

  await setSystemOverrides({ alertsEnabled: true }, { email: 'admin@test.dev' });
  assert.equal((await getSystemState()).alerts_enabled, true);
  await consumeSignal(makeSignal({ ticker: 'GL' }));
  assert.equal(provider.sent.length, 1);
});

test('KIMI_DRY_RUN=true sends nothing but still logs and fans out', async () => {
  const clock = new TestClock(T0);
  const { provider } = setup({ clock, dryRun: true });
  await createUser();
  await consumeSignal(makeSignal());
  assert.equal(provider.sent.length, 0);
  const delivery = await getDelivery('CSX__2026-11-05', 'user_a');
  assert.equal(delivery.status, 'sent');
  assert.equal(delivery.dry_run, true);
  const [message] = await listUserMessages('user_a');
  assert.equal(message.status, 'dry_run');
  assert.equal(message.kind, 'alert');
  // The dashboard override cannot lower the env floor.
  await setSystemOverrides({ dryRun: false }, { email: 'admin@test.dev' });
  assert.equal((await getSystemState()).dry_run, true);
});

test('quiet hours suppress in the user\'s timezone', async () => {
  const clock = new TestClock('2026-11-06T03:30:00Z'); // 22:30 ET, 19:30 PT
  const { provider } = setup({ clock });
  const quiet = { quiet_hours: { enabled: true, start: '22:00', end: '07:00' } };
  await createUser({ userId: 'east', phone: '+12125550101', timezone: 'America/New_York', prefs: quiet });
  await createUser({ userId: 'west', phone: '+13105550101', timezone: 'America/Los_Angeles', prefs: quiet });
  await consumeSignal(makeSignal({ date: '2026-11-06' }));
  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, '+13105550101');
  assert.equal((await getDelivery('CSX__2026-11-06', 'east')).suppression_reason, 'quiet_hours');
});
