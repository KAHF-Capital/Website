#!/usr/bin/env node
// Replay historical backend signals through Kimi's alert engine in dry run.
// Prints what would have been sent, to whom, and why everyone else was
// suppressed. Use it to tune DELIVERY settings (caps, dedupe, digest, quiet
// hours); signal parameters live in the backend, not here.
//
//   node scripts/kimi-replay.js [options]
//
//   --since YYYY-MM-DD / --until YYYY-MM-DD / --ticker CSX
//   --users store|sample        replay against current users (default) or sample personas
//   --max-per-day N             override every user's daily cap
//   --max-per-hour N            override every user's hourly cap
//   --dedupe-minutes N          same-ticker dedupe window (default 120)
//   --digest N|off              force digest mode with an N-minute window, or turn it off
//   --quiet HH:MM-HH:MM|off     force quiet hours for every user
//   --market-hours-only         force market-hours-only delivery
//   --min-notional USD          force a minimum notional
//   --verbose                   list recipients per suppression reason
//   --json FILE                 also write the full result as JSON
//
// Runs in an isolated in-memory store with a mock provider: nothing is sent
// and nothing is written to the real store.

import fs from 'fs';
import path from 'path';

function loadEnv() {
  const file = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

function parseArgs(argv) {
  const opts = { users: 'store', verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i].replace(/^--/, '');
    const next = () => argv[++i];
    if (key === 'verbose') opts.verbose = true;
    else if (key === 'market-hours-only') opts.marketHoursOnly = true;
    else if (['since', 'until', 'ticker', 'users', 'digest', 'quiet', 'json'].includes(key)) opts[key] = next();
    else if (key === 'max-per-day') opts.maxPerDay = parseInt(next(), 10);
    else if (key === 'max-per-hour') opts.maxPerHour = parseInt(next(), 10);
    else if (key === 'dedupe-minutes') opts.dedupeMinutes = parseInt(next(), 10);
    else if (key === 'min-notional') opts.minNotional = Number(next());
  }
  return opts;
}

const SAMPLE_PERSONAS = [
  { label: 'all signals, NY, quiet 22-07', timezone: 'America/New_York', preferences: {} },
  { label: 'all signals, LA, $500M+', timezone: 'America/Los_Angeles', preferences: { min_notional: 500e6 } },
  { label: 'watchlist CSX/NVDA/AAPL', timezone: 'America/New_York', preferences: { watchlist: { mode: 'custom', tickers: ['CSX', 'NVDA', 'AAPL'], sectors: [] } } },
  { label: 'Healthcare sector', timezone: 'America/Chicago', preferences: { watchlist: { mode: 'custom', tickers: [], sectors: ['Healthcare'] } } },
  { label: 'market hours only, 2/day', timezone: 'America/New_York', preferences: { market_hours_only: true, max_alerts_per_day: 2 } },
  { label: '60-minute digest', timezone: 'America/New_York', preferences: { digest: { enabled: true, interval_minutes: 60 } } },
  { label: 'London, no quiet hours', timezone: 'Europe/London', preferences: { quiet_hours: { enabled: false, start: '22:00', end: '07:00' } } }
];

async function main() {
  loadEnv();
  const opts = parseArgs(process.argv.slice(2));
  process.env.KIMI_DRY_RUN = 'true';
  process.env.KIMI_ALERTS_ENABLED = 'true';
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';

  const { KIMI_CONFIG } = await import('../lib/kimi/kimi.config.js');
  const db = await import('../lib/kimi/db.js');
  const store = await import('../lib/kimi/store.js');
  const { backend } = await import('../lib/kimi/backend.js');
  const { MockMessagingProvider, setMessagingProviderForTests } = await import('../lib/kimi/messaging/index.js');
  const { consumeSignal, flushDigests } = await import('../lib/kimi/alert-engine.js');
  const { setClock, formatInTimeZone } = await import('../lib/kimi/runtime.js');

  // 1. Users: current profiles from the configured store, or sample personas.
  let sources = [];
  if (opts.users !== 'sample') {
    try {
      sources = (await store.listProfiles({ smsEnabledOnly: true })).map((p) => ({ label: p.phone_masked || p.user_id, user_id: p.user_id, timezone: p.timezone, preferences: p.preferences, plan: p.plan }));
    } catch (err) {
      console.warn(`Could not read users from the store (${err.message}); using sample personas.`);
    }
  }
  if (!sources.length) {
    if (opts.users !== 'sample') console.log(`No text-enabled users in the ${db.describeDb().mode} store; using sample personas.`);
    sources = SAMPLE_PERSONAS.map((p, i) => ({ ...p, user_id: `persona_${i + 1}` }));
  }

  // 2. Signals from the backend feed (Blob when BLOB_READ_WRITE_TOKEN is set, else the bundled files).
  const feed = await backend().loadPublishedSignals();
  if (!feed.ok) throw new Error('Backend signal feed unavailable');
  const signals = feed.signals
    .map((s) => s.read)
    .filter((r) => r.found_at && (!opts.since || r.date >= opts.since) && (!opts.until || r.date <= opts.until) && (!opts.ticker || r.ticker === opts.ticker.toUpperCase()))
    .sort((a, b) => a.found_at.localeCompare(b.found_at));
  if (!signals.length) {
    console.log('No backend signals match those filters.');
    return;
  }

  // 3. Isolated replay store with delivery-setting overrides.
  db.useMemoryDb();
  setMessagingProviderForTests(new MockMessagingProvider());
  if (Number.isFinite(opts.dedupeMinutes)) KIMI_CONFIG.delivery.sameTickerDedupeMinutes = opts.dedupeMinutes;
  let simMs = new Date(signals[0].found_at).getTime() - 86400000;
  setClock(() => simMs);
  const labels = new Map();
  for (const [i, src] of sources.entries()) {
    const uid = src.user_id;
    const prefs = { ...(src.preferences || {}) };
    if (Number.isFinite(opts.maxPerDay)) prefs.max_alerts_per_day = opts.maxPerDay;
    if (Number.isFinite(opts.maxPerHour)) prefs.max_alerts_per_hour = opts.maxPerHour;
    if (opts.digest) prefs.digest = opts.digest === 'off' ? { enabled: false, interval_minutes: 30 } : { enabled: true, interval_minutes: parseInt(opts.digest, 10) };
    if (opts.quiet) {
      const [start, end] = opts.quiet.split('-');
      prefs.quiet_hours = opts.quiet === 'off' ? { enabled: false, start: '22:00', end: '07:00' } : { enabled: true, start, end };
    }
    if (opts.marketHoursOnly) prefs.market_hours_only = true;
    if (Number.isFinite(opts.minNotional)) prefs.min_notional = opts.minNotional;
    const phone = `+1555010${String(1000 + i).slice(-4)}`;
    await store.ensureProfile(uid, { plan: src.plan || 'free' });
    await store.claimPhone(uid, phone);
    await store.updateProfile(uid, { ...store.phoneFields(phone), phone_verified_at: new Date(simMs).toISOString(), consent_at: new Date(simMs).toISOString(), timezone: src.timezone || 'America/New_York', preferences: prefs });
    labels.set(uid, src.label || uid);
  }

  // 4. Replay each signal one minute after the backend published it.
  const rows = [];
  let digestAlerts = 0;
  const flush = async () => {
    digestAlerts += (await flushDigests()).sent || 0;
  };
  for (const read of signals) {
    const target = new Date(read.found_at).getTime() + 60000;
    while (simMs + 3600000 < target) {
      simMs += 3600000;
      await flush();
    }
    simMs = target;
    await flush();
    const res = await consumeSignal(read, { paramVersion: feed.method });
    const deliveries = await store.queryDeliveries({ alertId: res.id });
    const messages = (await db.getDb().query(store.COL.messages)).filter((m) => m.related_alert_id === res.id && m.kind === 'alert');
    rows.push({
      id: res.id,
      ticker: read.ticker,
      found_at: read.found_at,
      status: res.status,
      text: messages[0]?.body || null,
      sent: deliveries.filter((d) => d.status === 'sent').map((d) => d.user_id),
      queued_digest: deliveries.filter((d) => d.status === 'queued_digest').map((d) => d.user_id),
      suppressed: deliveries.filter((d) => d.status === 'suppressed').map((d) => ({ user_id: d.user_id, reason: d.suppression_reason + (d.cap_window ? `:${d.cap_window}` : '') }))
    });
  }
  for (let h = 0; h < 24; h += 1) {
    simMs += 3600000;
    await flush();
  }
  const digestTexts = (await db.getDb().query(store.COL.messages)).filter((m) => m.kind === 'digest').length;
  setClock(null);

  // 5. Report.
  const reasonTotals = {};
  const perUser = new Map([...labels.keys()].map((uid) => [uid, { sent: 0, digest: 0, suppressed: {} }]));
  console.log(`\nKimi alert replay (dry run): ${signals.length} backend signals, ${signals[0].date} to ${signals.at(-1).date}, ${labels.size} users`);
  console.log(`Backend method: ${feed.method || 'not versioned'} | source: ${feed.source}`);
  console.log(`Delivery: dedupe ${KIMI_CONFIG.delivery.sameTickerDedupeMinutes}m, hourly cap ${opts.maxPerHour ?? 'per user'}, daily cap ${opts.maxPerDay ?? 'per user'}, digest ${opts.digest ?? 'per user'}, quiet hours ${opts.quiet ?? 'per user'}${opts.marketHoursOnly ? ', market hours only' : ''}\n`);
  for (const row of rows) {
    const byReason = {};
    for (const s of row.suppressed) {
      (byReason[s.reason] ||= []).push(labels.get(s.user_id));
      reasonTotals[s.reason] = (reasonTotals[s.reason] || 0) + 1;
      perUser.get(s.user_id).suppressed[s.reason] = (perUser.get(s.user_id).suppressed[s.reason] || 0) + 1;
    }
    row.sent.forEach((u) => (perUser.get(u).sent += 1));
    row.queued_digest.forEach((u) => (perUser.get(u).digest += 1));
    const when = formatInTimeZone(new Date(row.found_at), 'America/New_York', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const reasons = Object.entries(byReason).map(([r, l]) => `${r} ${l.length}`).join(', ') || 'none';
    console.log(`${when} ET  ${row.id.padEnd(18)} ${row.status === 'active' ? '' : `[${row.status}] `}sent ${row.sent.length}, digest ${row.queued_digest.length}, suppressed ${row.suppressed.length} (${reasons})`);
    if (row.text) console.log(`    "${row.text}"`);
    if (opts.verbose) {
      if (row.sent.length) console.log(`    sent to: ${row.sent.map((u) => labels.get(u)).join('; ')}`);
      for (const [r, list] of Object.entries(byReason)) console.log(`    ${r}: ${list.join('; ')}`);
    }
  }
  const totalSent = rows.reduce((s, r) => s + r.sent.length, 0);
  console.log(`\nTotals: ${totalSent} sent immediately, ${digestAlerts} delivered in ${digestTexts} digest texts, ${Object.values(reasonTotals).reduce((a, b) => a + b, 0)} suppressed.`);
  console.log(`Suppression reasons: ${Object.entries(reasonTotals).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(', ') || 'none'}`);
  console.log('\nPer user:');
  for (const [uid, s] of perUser) {
    const sup = Object.entries(s.suppressed).map(([r, n]) => `${r} ${n}`).join(', ') || 'none';
    console.log(`  ${labels.get(uid).padEnd(34)} sent ${String(s.sent).padStart(3)}, digest ${String(s.digest).padStart(3)}, suppressed: ${sup}`);
  }
  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify({ options: opts, method: feed.method, rows, reasonTotals, perUser: Object.fromEntries(perUser), digestAlerts, digestTexts }, null, 2));
    console.log(`\nWrote ${opts.json}`);
  }
}

main().catch((err) => {
  console.error('Replay failed:', err);
  process.exit(1);
});
