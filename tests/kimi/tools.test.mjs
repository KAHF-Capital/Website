import test from 'node:test';
import assert from 'node:assert/strict';
import { TestClock, createUser, flushBackgroundTasks, makeSignal, setup } from './helpers.mjs';
import { executeTool, TOOL_DEFINITIONS } from '../../lib/kimi/tools.js';
import { consumeSignal } from '../../lib/kimi/alert-engine.js';
import { submitBacktest, runBacktestJob } from '../../lib/kimi/backtests.js';
import { COL, getProfile } from '../../lib/kimi/store.js';
import { getDb } from '../../lib/kimi/db.js';

const ctxFor = (userId) => ({ userId, timezone: 'America/New_York', channel: 'imessage', pendingJobs: [] });

test('no tool schema lets the model choose a user', () => {
  const json = JSON.stringify(TOOL_DEFINITIONS);
  assert.doesNotMatch(json, /user_?id|uid|owner/i);
});

test('tools refuse to run without a server-side authenticated user', async () => {
  setup();
  await assert.rejects(() => executeTool('get_preferences', {}, {}), /Unauthorized/);
  await assert.rejects(() => executeTool('get_preferences', { user_id: 'user_a' }, {}), /Unauthorized/);
});

test('users can only read alerts that were sent to them', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser({ userId: 'alice', phone: '+14155550101', prefs: { watchlist: { mode: 'custom', tickers: ['CSX'] } } });
  await createUser({ userId: 'bob', phone: '+14155550102', prefs: { watchlist: { mode: 'custom', tickers: ['NVDA'] } } });
  await consumeSignal(makeSignal({ ticker: 'CSX' }));

  const mine = await executeTool('get_alert', { alert_id: 'CSX__2026-11-05' }, ctxFor('alice'));
  assert.equal(mine.ticker, 'CSX');
  await assert.rejects(() => executeTool('get_alert', { alert_id: 'CSX__2026-11-05' }, ctxFor('bob')), /Forbidden/);
  // A model-supplied user id is ignored; the server context decides.
  await assert.rejects(() => executeTool('get_alert', { alert_id: 'CSX__2026-11-05', user_id: 'alice' }, ctxFor('bob')), /Forbidden/);
});

test('users can only read and compare their own backtests', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser({ userId: 'alice', phone: '+14155550101' });
  await createUser({ userId: 'bob', phone: '+14155550102' });
  const { job } = await submitBacktest({ userId: 'alice', request: { ticker: 'NVDA' } });
  await runBacktestJob(job.id);
  await flushBackgroundTasks();

  const own = await executeTool('get_backtest_result', { job_id: job.id }, ctxFor('alice'));
  assert.equal(own.status, 'completed');
  await assert.rejects(() => executeTool('get_backtest_result', { job_id: job.id }, ctxFor('bob')), /Forbidden/);
  await assert.rejects(() => executeTool('compare_backtests', { job_ids: [job.id] }, ctxFor('bob')), /Forbidden/);
});

test('preference updates only ever touch the caller', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser({ userId: 'alice', phone: '+14155550101' });
  await createUser({ userId: 'bob', phone: '+14155550102' });
  await executeTool('update_preferences', { user_id: 'bob', min_notional: 5e8, add_tickers: ['$nvda'] }, ctxFor('alice'));
  const alice = await getProfile('alice');
  const bob = await getProfile('bob');
  assert.equal(alice.preferences.min_notional, 5e8);
  assert.deepEqual(alice.preferences.watchlist.tickers, ['NVDA']);
  assert.equal(alice.preferences.watchlist.mode, 'custom');
  assert.equal(bob.preferences.min_notional, 0);
  await assert.rejects(() => executeTool('update_preferences', { timezone: 'Mars/Olympus' }, ctxFor('alice')), /timezone/);
});

test('run_backtest only accepts fields from the backtest schema', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser({ userId: 'alice' });
  await assert.rejects(() => executeTool('run_backtest', { config: { ticker: 'NVDA', stop_loss: 0.2 } }, ctxFor('alice')), /Unsupported field/);
  await assert.rejects(() => executeTool('run_backtest', { config: { ticker: 'NVDA', structures: ['iron_condor'] } }, ctxFor('alice')), /Unsupported structure/);
});

test('every tool call is logged with name, args, latency and outcome', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser({ userId: 'alice' });
  await executeTool('get_preferences', {}, ctxFor('alice'));
  await executeTool('get_alert', { alert_id: 'nope' }, ctxFor('alice')).catch(() => null);
  await executeTool('no_such_tool', {}, ctxFor('alice')).catch(() => null);
  const calls = await getDb().query(COL.toolCalls);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map((c) => [c.tool, c.success]).sort(), [['get_alert', false], ['get_preferences', true], ['no_such_tool', false]]);
  assert.ok(calls.every((c) => typeof c.latency_ms === 'number' && c.user_id === 'alice'));
  const events = (await getDb().query(COL.events)).filter((e) => e.type === 'tool_called' || e.type === 'tool_failed');
  assert.equal(events.length, 3);
});
