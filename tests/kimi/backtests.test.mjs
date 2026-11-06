import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVES, TestClock, createUser, makeWindows, setup } from './helpers.mjs';
import { deriveMetrics, formatComparisonText, rankResults, runBacktestJob, submitBacktest, validateBacktestRequest } from '../../lib/kimi/backtests.js';
import { analyzeOptionsProfitability } from '../../lib/options-analysis-service.js';
import { getBacktest, listUserMessages, queryEvents } from '../../lib/kimi/store.js';

test('derived per-window returns reproduce the backend\'s own win counts', () => {
  const windows = makeWindows();
  for (const [structure, premium] of [['call', 3.5], ['put', 3.5], ['straddle', 7]]) {
    const p = premium / 100;
    const backendStats = analyzeOptionsProfitability(windows, {
      strategy: structure,
      upperBreakevenPct: structure === 'put' ? undefined : p,
      lowerBreakevenPct: structure === 'call' ? undefined : -p
    });
    const derived = deriveMetrics({ structure, windows, premium, strike: 100, dte: 30 });
    assert.equal(derived.trades, backendStats.totalSamples, structure);
    assert.equal(derived.wins, backendStats.totalProfitable, structure);
  }
});

test('hold-to-expiry payoffs, drawdown and Sharpe are computed from the windows', () => {
  const windows = makeWindows([0.1, -0.1]);
  const call = deriveMetrics({ structure: 'call', windows, premium: 5, strike: 100, dte: 30 });
  // +10% move: (10 - 5) / 5 = +100%; -10% move: -100%.
  assert.deepEqual(call.trade_list.map((t) => t.return_pct).sort(), [-100, 100]);
  assert.equal(call.avg_return, 0);
  assert.equal(call.sharpe, 0);
  const straddle = deriveMetrics({ structure: 'straddle', windows, premium: 5, strike: 100, dte: 30 });
  assert.equal(straddle.avg_return, 100);
  assert.equal(straddle.max_drawdown, 0);
  assert.equal(straddle.final_equity, 100000 + 2 * 5000);
  const losing = deriveMetrics({ structure: 'put', windows: makeWindows([0.05, 0.05]), premium: 5, strike: 100, dte: 30 });
  assert.equal(losing.max_drawdown, -10); // two -$5,000 trades on $100,000
});

test('ranking honors the requested metric', () => {
  const rows = [
    { structure: 'call', sharpe: 0.5, win_rate: 60, avg_return: 10, max_drawdown: -30 },
    { structure: 'put', sharpe: 1.2, win_rate: 40, avg_return: 5, max_drawdown: -10 },
    { structure: 'straddle', sharpe: null, win_rate: 50, avg_return: 20, max_drawdown: -20 }
  ];
  assert.deepEqual(rankResults(rows, 'sharpe').map((r) => r.structure), ['put', 'call', 'straddle']);
  assert.deepEqual(rankResults(rows, 'win_rate').map((r) => r.structure), ['call', 'straddle', 'put']);
  assert.deepEqual(rankResults(rows, 'avg_return').map((r) => r.structure), ['straddle', 'call', 'put']);
  assert.deepEqual(rankResults(rows, 'max_drawdown').map((r) => r.structure), ['put', 'straddle', 'call']);
});

test('request validation reads the schema and rejects invented fields', () => {
  const now = new Date('2026-11-05T15:00:00Z');
  assert.deepEqual(validateBacktestRequest({ ticker: '$nvda' }, now), {
    ticker: 'NVDA',
    structures: ['call', 'put', 'straddle'],
    days_to_expiration: 30,
    as_of_date: null,
    rank_by: 'sharpe',
    alert_id: null
  });
  assert.throws(() => validateBacktestRequest({ ticker: 'NVDA', holding_days: 10 }, now), /Unsupported field/);
  assert.throws(() => validateBacktestRequest({ ticker: 'NVDA', days_to_expiration: 2 }, now), /days_to_expiration/);
  assert.throws(() => validateBacktestRequest({ ticker: 'NVDA', as_of_date: '2027-01-01' }, now), /future/);
  assert.throws(() => validateBacktestRequest({ ticker: 'NVDA', rank_by: 'sortino' }, now), /rank_by/);
});

test('a backtest runs on the backend API, ranks structures and texts a top-3 summary', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser();
  const { job, ack } = await submitBacktest({ userId: 'user_a', request: { ticker: 'NVDA' }, channel: 'imessage' });
  assert.match(ack, /^Running 3 structures on \$NVDA \(30-day ATM, history since 20\d\d\), ~\d+s\.$/);
  await runBacktestJob(job.id);

  const done = await getBacktest(job.id);
  assert.equal(done.status, 'completed');
  assert.equal(done.results.length, 3);
  assert.equal(done.results[0].rank, 1);
  assert.equal(done.results[0].trades, MOVES.length);
  assert.ok(done.results.every((r) => r.derived_metrics_verified));
  assert.deepEqual(done.results[0].backend_config.strategy, done.results[0].structure);

  assert.equal(provider.sent.length, 1);
  const text = provider.sent[0].text;
  assert.match(text, /^\$NVDA by Sharpe: 1\) \w+: 26 trades, \d+% win, [+-]?\d+\.\d% avg, -?\d+% max DD, Sharpe -?\d+\.\d\d\. 2\) /);
  assert.match(text, /Caveat: Small sample: 26 windows\./);
  assert.match(text, /Hypothetical; past performance does not guarantee future results\./);
  assert.match(text, /https:\/\/kimi\.test\/k\/[A-Za-z0-9]+$/);
});

test('failures are reported in plain language with a backtest_failed event', async () => {
  const { provider } = setup({
    clock: new TestClock('2026-11-05T15:00:00Z'),
    backend: { getLiveOptionQuote: async () => { throw new Error('No options contracts found'); } }
  });
  await createUser();
  const { job } = await submitBacktest({ userId: 'user_a', request: { ticker: 'ILLQ' }, channel: 'sms' });
  await runBacktestJob(job.id);
  const failed = await getBacktest(job.id);
  assert.equal(failed.status, 'failed');
  assert.match(provider.sent[0].text, /^The \$ILLQ backtest didn't finish: Couldn't get a live/);
  assert.equal((await queryEvents({ types: 'backtest_failed' })).length, 1);
});

test('per-user concurrency and daily caps apply; failed runs do not count', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser();
  await submitBacktest({ userId: 'user_a', request: { ticker: 'AAA' } });
  await submitBacktest({ userId: 'user_a', request: { ticker: 'BBB' } });
  await assert.rejects(() => submitBacktest({ userId: 'user_a', request: { ticker: 'CCC' } }), (err) => err.code === 'CONCURRENCY_LIMIT');
  assert.equal((await queryEvents({ types: 'backtest_limited' })).length, 1);
});

test('web backtests post their results into the shared thread', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  await createUser();
  const { job } = await submitBacktest({ userId: 'user_a', request: { ticker: 'NVDA', structures: ['call'] }, channel: 'web' });
  await runBacktestJob(job.id);
  const [msg] = await listUserMessages('user_a');
  assert.equal(msg.channel, 'web');
  assert.equal(msg.related_backtest_id, job.id);
  assert.match(msg.body, /^\$NVDA by Sharpe: 1\) Call:/);
});

test('summary text omits metrics that could not be verified', () => {
  const text = formatComparisonText({
    ticker: 'X',
    rankBy: 'win_rate',
    caveat: 'Small sample: 12 windows.',
    ranked: [{ structure: 'call', trades: 12, win_rate: 50, avg_return: null, max_drawdown: null, sharpe: null }]
  });
  assert.equal(text, '$X by win rate: 1) Call: 12 trades, 50% win. Caveat: Small sample: 12 windows. Hypothetical; past performance does not guarantee future results.');
});
