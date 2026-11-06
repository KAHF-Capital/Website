import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.mjs';
import { evaluateDelivery, isMarketHours, isQuietHours, watchlistMatch } from '../../lib/kimi/alert-engine.js';
import { withDefaultPreferences } from '../../lib/kimi/store.js';

const night = { enabled: true, start: '22:00', end: '07:00' };

test('quiet hours use the user\'s own timezone', () => {
  const instant = new Date('2026-07-01T02:30:00Z'); // 22:30 EDT, 19:30 PDT
  assert.equal(isQuietHours(instant, night, 'America/New_York'), true);
  assert.equal(isQuietHours(instant, night, 'America/Los_Angeles'), false);
  assert.equal(isQuietHours(instant, night, 'Europe/London'), true); // 03:30 BST
});

test('quiet hours follow DST changes (spring forward and fall back)', () => {
  // 2026-03-08: New York moves from EST (UTC-5) to EDT (UTC-4).
  assert.equal(isQuietHours(new Date('2026-03-08T10:30:00Z'), night, 'America/New_York'), true); // 06:30 EDT
  assert.equal(isQuietHours(new Date('2026-03-08T11:30:00Z'), night, 'America/New_York'), false); // 07:30 EDT (06:30 if DST were ignored)
  // 2026-11-01: back to EST.
  assert.equal(isQuietHours(new Date('2026-11-01T11:30:00Z'), night, 'America/New_York'), true); // 06:30 EST
  assert.equal(isQuietHours(new Date('2026-11-01T12:30:00Z'), night, 'America/New_York'), false); // 07:30 EST
  // London changes on a different date (2026-03-29).
  assert.equal(isQuietHours(new Date('2026-03-29T06:30:00Z'), night, 'Europe/London'), false); // 07:30 BST
  assert.equal(isQuietHours(new Date('2026-03-28T06:30:00Z'), night, 'Europe/London'), true); // 06:30 GMT
});

test('daytime quiet windows and disabled quiet hours', () => {
  const lunch = { enabled: true, start: '12:00', end: '13:00' };
  assert.equal(isQuietHours(new Date('2026-07-01T16:30:00Z'), lunch, 'America/New_York'), true);
  assert.equal(isQuietHours(new Date('2026-07-01T17:30:00Z'), lunch, 'America/New_York'), false);
  assert.equal(isQuietHours(new Date('2026-07-01T02:30:00Z'), { ...night, enabled: false }, 'America/New_York'), false);
});

test('market hours: weekdays 9:30-16:00 ET, closed weekends and NYSE holidays', () => {
  assert.equal(isMarketHours(new Date('2026-11-05T15:00:00Z')), true); // Thu 10:00 ET
  assert.equal(isMarketHours(new Date('2026-11-05T14:29:00Z')), false); // 09:29 ET
  assert.equal(isMarketHours(new Date('2026-11-05T21:00:00Z')), false); // 16:00 ET
  assert.equal(isMarketHours(new Date('2026-11-07T15:00:00Z')), false); // Saturday
  assert.equal(isMarketHours(new Date('2026-11-26T15:00:00Z')), false); // Thanksgiving
});

function profile(overrides = {}) {
  return {
    user_id: 'u1',
    timezone: 'America/New_York',
    paused_until: null,
    opted_out_at: null,
    ...overrides,
    preferences: withDefaultPreferences({ quiet_hours: { enabled: false, start: '22:00', end: '07:00' }, ...(overrides.preferences || {}) })
  };
}

const signal = { ticker: 'CSX', dark_pool_value: 630e6 };
const at = new Date('2026-11-05T15:00:00Z');

test('watchlist: all, custom tickers, sectors and muted tickers', () => {
  const prefs = (wl) => withDefaultPreferences({ watchlist: wl });
  assert.equal(watchlistMatch(prefs({ mode: 'all' }), signal), true);
  assert.equal(watchlistMatch(prefs({ mode: 'all', muted: ['CSX'] }), signal), false);
  assert.equal(watchlistMatch(prefs({ mode: 'custom', tickers: ['NVDA'] }), signal), false);
  assert.equal(watchlistMatch(prefs({ mode: 'custom', tickers: ['CSX'] }), signal), true);
  assert.equal(watchlistMatch(prefs({ mode: 'custom', tickers: [], sectors: ['Industrials'] }), signal, 'Industrials'), true);
});

test('gates run in the documented order with reason codes', () => {
  const r = (p, extra = {}) => evaluateDelivery({ profile: profile(p), signal, now: at, ...extra }).reason || 'eligible';
  assert.equal(r({ preferences: { watchlist: { mode: 'custom', tickers: ['NVDA'] } }, paused_until: '2026-12-01T00:00:00Z' }), 'watchlist_miss');
  assert.equal(r({ preferences: { min_notional: 1e9 } }), 'min_notional');
  assert.equal(r({ paused_until: '2026-11-06T00:00:00Z', opted_out_at: '2026-11-01T00:00:00Z' }), 'paused');
  assert.equal(r({ opted_out_at: '2026-11-01T00:00:00Z' }), 'opted_out');
  assert.equal(r({ preferences: { quiet_hours: { enabled: true, start: '09:00', end: '11:00' }, market_hours_only: true } }), 'quiet_hours');
  assert.equal(r({ preferences: { market_hours_only: true } }, { now: new Date('2026-11-05T22:00:00Z') }), 'market_hours');
  assert.equal(r({}), 'eligible');
  assert.equal(r({ paused_until: '2026-11-01T00:00:00Z' }), 'eligible'); // expired pause
});

test('min notional is a personal filter and passes signals without a notional', () => {
  const p = profile({ preferences: { min_notional: 1e9 } });
  assert.equal(evaluateDelivery({ profile: p, signal: { ticker: 'CSX' }, now: at }).eligible, true);
});

test('same-ticker dedupe within 2 hours', () => {
  const recent = [{ ticker: 'CSX', status: 'sent', sent_at: '2026-11-05T13:30:00Z' }];
  assert.equal(evaluateDelivery({ profile: profile(), signal, recent, now: at }).reason, 'dedupe');
  const older = [{ ticker: 'CSX', status: 'sent', sent_at: '2026-11-05T12:30:00Z' }];
  assert.equal(evaluateDelivery({ profile: profile(), signal, recent: older, now: at }).eligible, true);
  const suppressed = [{ ticker: 'CSX', status: 'suppressed', created_at: '2026-11-05T14:50:00Z' }];
  assert.equal(evaluateDelivery({ profile: profile(), signal, recent: suppressed, now: at }).eligible, true);
});

test('caps: 2 per hour, then 5 per local day', () => {
  const sent = (iso, ticker) => ({ ticker, status: 'sent', sent_at: iso });
  const hour = [sent('2026-11-05T14:20:00Z', 'A'), sent('2026-11-05T14:40:00Z', 'B')];
  assert.deepEqual(evaluateDelivery({ profile: profile(), signal, recent: hour, now: at }), { eligible: false, reason: 'cap', capWindow: 'hour' });

  const day = ['05:10', '06:10', '07:10', '08:10', '09:10'].map((t, i) => sent(`2026-11-05T${t}:00Z`, `T${i}`));
  assert.deepEqual(evaluateDelivery({ profile: profile(), signal, recent: day, now: at }), { eligible: false, reason: 'cap', capWindow: 'day' });

  // The daily cap resets at the user's local midnight: 03:10Z is still Nov 4 in New York.
  const yesterday = ['01:10', '02:10', '03:10'].map((t, i) => sent(`2026-11-05T${t}:00Z`, `Y${i}`));
  const today = ['05:10', '06:10'].map((t, i) => sent(`2026-11-05T${t}:00Z`, `D${i}`));
  assert.equal(evaluateDelivery({ profile: profile(), signal, recent: [...yesterday, ...today], now: at }).eligible, true);

  const custom = profile({ preferences: { max_alerts_per_day: 2 } });
  assert.equal(evaluateDelivery({ profile: custom, signal, recent: today, now: at }).reason, 'cap');
});

test('digest mode marks eligible deliveries for bundling', () => {
  const p = profile({ preferences: { digest: { enabled: true, interval_minutes: 45 } } });
  assert.deepEqual(evaluateDelivery({ profile: p, signal, now: at }), { eligible: true, digest: true, intervalMinutes: 45 });
});
