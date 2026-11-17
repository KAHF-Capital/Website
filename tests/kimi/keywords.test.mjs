import test from 'node:test';
import assert from 'node:assert/strict';
import { TestClock, createUser, inbound, makeSignal, setup } from './helpers.mjs';
import { matchKeyword } from '../../lib/kimi/keywords.js';
import { processInbound } from '../../lib/kimi/inbound.js';
import { consumeSignal } from '../../lib/kimi/alert-engine.js';
import { getDelivery, getProfile, queryEvents } from '../../lib/kimi/store.js';

test('keyword matching is case-insensitive and tolerant of punctuation', () => {
  for (const t of ['STOP', 'stop', ' Stop. ', 'StopAll', 'UNSUBSCRIBE', 'cancel', 'End', 'quit!', 'stop texting me', 'Please stop sending messages', 'opt out']) {
    assert.equal(matchKeyword(t), 'OPT_OUT', t);
  }
  for (const t of ['START', 'start', 'Unstop']) assert.equal(matchKeyword(t), 'OPT_IN', t);
  assert.equal(matchKeyword('help'), 'HELP');
  assert.equal(matchKeyword('Pause'), 'PAUSE');
  assert.equal(matchKeyword('RESUME'), 'RESUME');
  for (const t of ['stop loss on $NVDA?', 'end of day prints', 'help me backtest CSX', 'start a backtest', 'pause for a sec, what is IV']) {
    assert.equal(matchKeyword(t), null, t);
  }
});

test('STOP opts out instantly with one confirmation; nothing more until START', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  const adapter = provider;

  const res = await processInbound({ adapter, inbound: inbound('STOP') });
  assert.equal(res.action, 'opted_out');
  assert.equal(provider.sent.length, 1);
  assert.match(provider.sent[0].text, /unsubscribed/);
  assert.ok((await getProfile('user_a')).opted_out_at);
  assert.equal((await queryEvents({ types: 'opted_out' })).length, 1);

  await consumeSignal(makeSignal());
  assert.equal(provider.sent.length, 1, 'no alerts after STOP');
  assert.equal((await getDelivery('CSX__2026-11-05', 'user_a')).suppression_reason, 'opted_out');

  const ignored = await processInbound({ adapter, inbound: inbound('what about $NVDA?') });
  assert.equal(ignored.status, 'ignored_opted_out');
  await processInbound({ adapter, inbound: inbound('STOP') });
  assert.equal(provider.sent.length, 1, 'opted-out numbers get no reply, even to STOP');

  await processInbound({ adapter, inbound: inbound('HELP') });
  assert.equal(provider.sent.length, 2);
  assert.match(provider.sent[1].text, /STOP to cancel/);

  const back = await processInbound({ adapter, inbound: inbound('START') });
  assert.equal(back.action, 'opted_in');
  assert.equal((await getProfile('user_a')).opted_out_at, null);
  clock.advance(60000);
  await consumeSignal(makeSignal({ ticker: 'GL', found_at: new Date(clock.now).toISOString() }));
  assert.match(provider.sent.at(-1).text, /^Kaia: \$GL/);
});

test('PAUSE mutes alerts for 24h and RESUME turns them back on', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  await processInbound({ adapter: provider, inbound: inbound('pause') });
  const paused = await getProfile('user_a');
  assert.equal(new Date(paused.paused_until).getTime() - clock.now, 24 * 3600 * 1000);
  assert.match(provider.sent[0].text, /RESUME/);

  await consumeSignal(makeSignal());
  assert.equal((await getDelivery('CSX__2026-11-05', 'user_a')).suppression_reason, 'paused');

  await processInbound({ adapter: provider, inbound: inbound('RESUME') });
  assert.equal((await getProfile('user_a')).paused_until, null);
  clock.advance(60000);
  await consumeSignal(makeSignal({ ticker: 'GL', found_at: new Date(clock.now).toISOString() }));
  assert.match(provider.sent.at(-1).text, /^Kaia: \$GL/);
});

test('STOP from an unknown number is honored at the phone level', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await processInbound({ adapter: provider, inbound: inbound('stop', { from: '+19175550199' }) });
  assert.equal(provider.sent.length, 1);
  await processInbound({ adapter: provider, inbound: inbound('hello?', { from: '+19175550199' }) });
  assert.equal(provider.sent.length, 1, 'no signup link to an opted-out number');
});
