import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { renderAlertText, renderDigestText } from '../../lib/kimi/alert-engine.js';

test('renders every clause the backend payload supports', () => {
  const text = renderAlertText(
    { ticker: 'CSX', date: '2026-10-22', dark_pool_value: 630282815.8, dark_pool_avg_price: 51.568, volume_ratio: 3.02, structure: 'straddle', strike: 52, expiration: '2026-11-20', entry_premium: 2.69, asof_hit_rate: 64 },
    { link: 'https://kimi.test/k/abc1234' }
  );
  assert.equal(
    text,
    'Kaia: $CSX dark pool print ($630M) on Oct 22, avg $51.57. Volume 3.0x the 7-day average. KAHF read: ATM straddle $52 exp Nov 20 at $2.69, 64% hist. hit rate. Reply MORE for details or BT to backtest this setup. https://kimi.test/k/abc1234'
  );
});

test('reproduces the spec example when the payload has intraday fields', () => {
  const text = renderAlertText({
    ticker: 'NVDA',
    total_volume: 1200000,
    dark_pool_value: 148000000,
    print_time: '10:42',
    price_reaction_pct: 0.08,
    reaction_window_minutes: 30,
    normal_move_pct: 0.6
  });
  assert.equal(text, 'Kaia: $NVDA dark pool print, 1.2M sh ($148M) at 10:42. Price +0.08% in 30 min vs ±0.6% normal. Reply MORE for details or BT to backtest this setup.');
});

test('drops clauses with missing fields instead of computing them', () => {
  const text = renderAlertText({ ticker: 'NVDA', dark_pool_avg_price: 120, total_volume: 1000000 });
  assert.equal(text, 'Kaia: $NVDA dark pool print, 1.0M sh, avg $120.00. Reply MORE for details or BT to backtest this setup.');
  // Notional is not derived from shares x price.
  assert.doesNotMatch(text, /\$120M|\(\$/);
  assert.doesNotMatch(text, /Volume|KAHF read|Price/);
});

test('drops only the optional sub-clause that is missing', () => {
  const text = renderAlertText({ ticker: 'AAPL', price_reaction_pct: -0.12, reaction_window_minutes: 30, structure: 'call' });
  assert.match(text, /Price -0\.12% in 30 min\./);
  assert.doesNotMatch(text, /normal/);
  assert.match(text, /KAHF read: long call\./);
});

test('ignores values of the wrong type rather than guessing', () => {
  const text = renderAlertText({ ticker: 'TSLA', dark_pool_value: 'n/a', volume_ratio: null, asof_hit_rate: 'high' });
  assert.equal(text, 'Kaia: $TSLA dark pool print. Reply MORE for details or BT to backtest this setup.');
});

test('returns null without a ticker', () => {
  assert.equal(renderAlertText({ dark_pool_value: 100000000 }), null);
});

test('digest lists each signal from its own fields', () => {
  const text = renderDigestText(
    [
      { ticker: 'CSX', dark_pool_value: 630e6, volume_ratio: 3.02 },
      { ticker: 'GL', volume_ratio: 12.09 }
    ],
    { link: 'https://kimi.test/k/d1' }
  );
  assert.equal(text, 'Kaia digest: 2 dark pool signals. $CSX $630M 3.0x; $GL 12.1x. Reply MORE $TICKER for details or BT $TICKER to backtest. https://kimi.test/k/d1');
});
