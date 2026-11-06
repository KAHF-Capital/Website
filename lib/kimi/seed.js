// Development seed: simulates ~8 weeks of Kimi usage through the real code
// paths (onboarding, alert fan-out, the agent, keywords, backtests, digests,
// rollups) on a simulated clock, so every /admin/kimi chart has realistic
// data. Real backend signal payloads come from the bundled
// track-record-reads.json; users, conversations, quotes and price paths are
// fake. Nothing leaves the machine: messaging, LLM and market data are
// replaced by local fakes. Refuses to run against Firestore.

import fs from 'fs';
import path from 'path';
import { KIMI_CONFIG } from './kimi.config.js';
import { describeDb, setFileAutoFlush, flushDb } from './db.js';
import { addDays, clockNow, flushBackgroundTasks, setClock, startOfLocalDay, usageDay } from './runtime.js';
import { setMessagingProviderForTests } from './messaging/index.js';
import { classifyIntentRules, setLlmProviderForTests } from './llm.js';
import { setBackendForTests } from './backend.js';
import { analyzeOptionsProfitability } from '../options-analysis-service.js';
import { consumeSignal, flushDigests, recordDeliveryReceipt, updateForwardReturns } from './alert-engine.js';
import { processInbound } from './inbound.js';
import { handleAgentTurn } from './agent.js';
import { buildRollups } from './analytics.js';
import { confirmPhoneVerification, startPhoneVerification } from './onboarding.js';
import { emitEvent, ensureProfile, getProfile, queryBacktests, queryDeliveries, resolveShortLink, updateProfile } from './store.js';

const ET = 'America/New_York';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s) {
  let h = 2166136261;
  for (const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

class SimClock {
  constructor(ms) {
    this.ms = ms;
  }
  set(ms) {
    if (ms > this.ms) this.ms = ms;
  }
  advance(ms) {
    this.ms += ms;
  }
}

// ---------------------------------------------------------------------------
// Local fakes
// ---------------------------------------------------------------------------

class SeedMessagingProvider {
  constructor(random) {
    this.name = 'sendblue';
    this.channel = 'imessage';
    this.random = random;
    this.smsNumbers = new Set();
    this.sent = [];
    this.counter = 0;
  }
  verifySignature() {
    return false;
  }
  parseInbound() {
    return null;
  }
  async sendTypingIndicator() {
    return true;
  }
  async send(to, text) {
    if (this.random() < 0.012) {
      const sms = this.smsNumbers.has(to);
      throw Object.assign(new Error('Carrier rejected message'), { code: sms ? (this.random() < 0.5 ? '30007' : '30003') : 'SB_RATE_LIMIT' });
    }
    this.counter += 1;
    this.sent.push({ to, text });
    return { providerMessageId: `seed_${this.counter}`, status: 'sent', channel: this.smsNumbers.has(to) ? 'sms' : 'imessage' };
  }
}

function seedBackend(random, clock) {
  const pathCache = new Map();
  const pricePath = (ticker) => {
    if (pathCache.has(ticker)) return pathCache.get(ticker);
    const r = rng(hashSeed(ticker));
    const vol = 0.012 + r() * 0.02;
    const drift = (r() - 0.45) * 0.0012;
    const bars = [];
    let price = 40 + r() * 300;
    for (let d = addDays('2023-01-03', 0); d <= addDays(usageDay(), 20); d = addDays(d, 1)) {
      const wd = new Date(`${d}T12:00:00Z`).getUTCDay();
      if (wd === 0 || wd === 6) continue;
      price *= 1 + drift + (r() - 0.5) * 2 * vol;
      bars.push({ date: d, open: price, high: price * 1.01, low: price * 0.99, close: Number(price.toFixed(2)), volume: 1e6 });
    }
    pathCache.set(ticker, bars);
    return bars;
  };
  const windowsFor = (ticker, dte, asOf) => {
    const bars = pricePath(ticker).filter((b) => b.date <= (asOf || usageDay(clockNow())));
    const desc = [...bars].reverse();
    const windows = [];
    for (let i = 0; i + dte < desc.length && windows.length < 26; i += dte) {
      const start = desc[i];
      const end = desc[i + dte];
      windows.push({ startDate: start.date, endDate: end.date, startPrice: start.close, endPrice: end.close, percentMove: (start.close - end.close) / end.close });
    }
    return windows;
  };
  const sectors = { CSX: 'Industrials', FDX: 'Industrials', NOC: 'Industrials', AVAV: 'Industrials', GL: 'Financials', USB: 'Financials', CM: 'Financials', BNS: 'Financials', CFG: 'Financials', PYPL: 'Financials', CEG: 'Utilities', TRP: 'Energy', SU: 'Energy', NTAP: 'Technology', PTC: 'Technology', VRSN: 'Technology', QRVO: 'Technology', TSEM: 'Technology', HUBS: 'Technology', CRWD: 'Technology', CRDO: 'Technology', NVDA: 'Technology', AAPL: 'Technology', CRL: 'Healthcare', REGN: 'Healthcare', CORT: 'Healthcare', HALO: 'Healthcare', PODD: 'Healthcare', DXCM: 'Healthcare', COO: 'Healthcare', CVS: 'Healthcare', NVS: 'Healthcare', NFLX: 'Communication Services', RDDT: 'Communication Services', EXPE: 'Consumer Discretionary', RCL: 'Consumer Discretionary', EBAY: 'Consumer Discretionary', EAT: 'Consumer Discretionary', LULU: 'Consumer Discretionary', CASY: 'Consumer Staples', BTI: 'Consumer Staples', FNV: 'Materials' };
  return {
    structures: ['call', 'put', 'straddle'],
    structureLabel: (s) => (s === 'call' ? 'Long Call' : s === 'put' ? 'Long Put' : 'ATM Straddle'),
    loadPublishedSignals: async () => ({ ok: true, historyOk: false, signals: [], rejected: [] }),
    getRecentPrints: async ({ ticker }) => {
      clock.advance(150 + random() * 300);
      const r = rng(hashSeed(`${ticker}:${usageDay(clockNow())}`));
      const bars = pricePath(ticker || 'NVDA');
      const last = bars.filter((b) => b.date <= usageDay(clockNow())).at(-1);
      const shares = Math.round(2e6 + r() * 2e7);
      return {
        ticker,
        sessions: [{ ticker: ticker || 'NVDA', date: last.date, shares, notional_usd: Math.round(shares * last.close), avg_price: last.close, trade_count: Math.round(200 + r() * 3000), volume_ratio_vs_7d: Number((0.6 + r() * 4).toFixed(2)) }],
        granularity: 'session aggregate'
      };
    },
    getPreviousClose: async (ticker) => ({ ticker, price: pricePath(ticker).filter((b) => b.date < usageDay(clockNow())).at(-1).close, basis: 'previous session close' }),
    getDailyBars: async (ticker, from, to) => pricePath(ticker).filter((b) => b.date >= from && b.date <= to && b.date < usageDay(clockNow())),
    getLiveOptionQuote: async (ticker, expiration, structure) => {
      clock.advance(400 + random() * 900);
      if (ticker === 'ILLQ' || random() < 0.04) throw new Error('No options contracts found');
      const spot = pricePath(ticker).filter((b) => b.date <= usageDay(clockNow())).at(-1).close;
      const strike = spot > 100 ? Math.round(spot / 5) * 5 : Math.round(spot);
      const single = Number((spot * (0.025 + random() * 0.03)).toFixed(2));
      return { strikePrice: strike, premium: structure === 'straddle' ? Number((single * 1.9).toFixed(2)) : single, expiration, currentPrice: spot, callPrice: single, putPrice: single };
    },
    runStructureBacktest: async (config) => {
      clock.advance(900 + random() * 2200);
      const p = config.premium / config.strikePrice;
      const windows = windowsFor(config.ticker, config.daysToExpiration, config.asOfDate);
      const analysis = analyzeOptionsProfitability(windows, {
        strategy: config.strategy,
        upperBreakevenPct: config.strategy === 'put' ? undefined : p,
        lowerBreakevenPct: config.strategy === 'call' ? undefined : -p
      });
      return { ...analysis, historyYears: 2.8, historyAsOf: config.asOfDate || usageDay(clockNow()) };
    },
    getAnalysisWindows: async ({ ticker, daysToExpiration, asOfDate }) => ({ windows: windowsFor(ticker, daysToExpiration, asOfDate), overlapping: false, historyStart: '2023-01-03', historyEnd: asOfDate || usageDay(clockNow()) }),
    markSignal: async () => null,
    getTickerSector: async (ticker) => ({ sector: sectors[ticker] || 'Technology', sic_code: null, sic_description: null })
  };
}

function seedLlm(random, clock) {
  const usage = (input, output) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: Math.round(input * 0.6) });
  return {
    name: 'seed-llm',
    async createMessage({ system, messages, tools }) {
      const sys = Array.isArray(system) ? system.map((b) => b.text).join('\n') : String(system || '');
      if (sys.includes('You label text messages')) {
        clock.advance(250 + random() * 400);
        const text = String(messages[0].content).match(/Message: """([\s\S]*)"""/)?.[1] || '';
        const r = classifyIntentRules(text, { hasRecentAlert: /recently received/.test(messages[0].content) });
        return { content: [{ type: 'text', text: JSON.stringify({ intent: r.intent, frustrated: r.frustrated, advice_request: r.adviceRequest }) }], usage: { input_tokens: 160, output_tokens: 22 }, stopReason: 'end_turn' };
      }
      if (sys.includes('compact memory')) {
        clock.advance(600 + random() * 800);
        return { content: [{ type: 'text', text: 'Watches unusual dark pool prints on a handful of large caps; asks for MORE on alerts and occasionally backtests straddles vs calls.' }], usage: { input_tokens: 900, output_tokens: 60 }, stopReason: 'end_turn' };
      }
      clock.advance(700 + random() * 1800);
      if (random() < 0.025) throw Object.assign(new Error('Request timed out'), { name: 'APIConnectionTimeoutError' });
      const last = messages[messages.length - 1];
      const inputTokens = 1800 + messages.length * 140;
      if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
        const result = JSON.parse(String(last.content[0].content).replace(/…\(truncated\)$/, '') || '{}');
        if (result.acknowledgement) return { content: [{ type: 'text', text: result.acknowledgement }], usage: usage(inputTokens, 45), stopReason: 'end_turn' };
        if (result.sessions?.[0]) {
          const s = result.sessions[0];
          return { content: [{ type: 'text', text: `$${s.ticker} printed $${Math.round(s.notional_usd / 1e6)}M off-exchange on ${s.date} at $${s.avg_price} avg, ${s.volume_ratio_vs_7d}x its 7-day volume.` }], usage: usage(inputTokens, 60), stopReason: 'end_turn' };
        }
        if (result.changed) return { content: [{ type: 'text', text: `Done, updated ${result.changed.join(', ').replace(/_/g, ' ')}.` }], usage: usage(inputTokens, 30), stopReason: 'end_turn' };
        if (result.watchlist) return { content: [{ type: 'text', text: `You get ${result.watchlist.mode === 'all' ? 'every signal' : result.watchlist.tickers.join(', ')}, max ${result.max_alerts_per_day}/day.` }], usage: usage(inputTokens, 40), stopReason: 'end_turn' };
        return { content: [{ type: 'text', text: 'I couldn\'t find that one. Try another ticker.' }], usage: usage(inputTokens, 25), stopReason: 'end_turn' };
      }
      const raw = typeof last.content === 'string' ? last.content : Array.isArray(last.content) && last.content[0]?.type === 'text' ? last.content[0].text : '';
      const text = raw.split('\n').pop();
      const ticker = (text.match(/\$([A-Z]{1,5})/) || [])[1];
      const tool = (name, input) => ({ content: [{ type: 'tool_use', id: `seed_${Math.round(random() * 1e9)}`, name, input }], usage: usage(inputTokens, 35), stopReason: 'tool_use' });
      if (/should i (buy|sell)|place (an )?order/i.test(text)) {
        return { content: [{ type: 'text', text: 'I can\'t tell you to buy or sell or place orders. I can show the dark pool data or backtest structures on it.' }], usage: usage(inputTokens, 35), stopReason: 'end_turn' };
      }
      if (ticker && /backtest|compare|vs/i.test(text)) return tool('run_backtest', { config: { ticker, structures: /straddle/i.test(text) ? ['straddle', 'call'] : undefined, days_to_expiration: /45/.test(text) ? 45 : undefined } });
      if (ticker) return tool('get_recent_dark_pool_prints', { ticker });
      if (/fewer|min notional|only send/i.test(text)) return tool('update_preferences', /fewer/i.test(text) ? { max_alerts_per_day: 3 } : { min_notional: 500000000 });
      if (/settings|watchlist/i.test(text)) return tool('get_preferences', {});
      if (/useless|wtf|didn.t work/i.test(text)) return { content: [{ type: 'text', text: 'Sorry about that. Text a ticker and I\'ll pull fresh numbers.' }], usage: usage(inputTokens, 25), stopReason: 'end_turn' };
      return { content: [{ type: 'text', text: 'Anytime. Text a ticker for dark pool prints or BT $TICKER to compare structures.' }], usage: usage(inputTokens, 30), stopReason: 'end_turn' };
    }
  };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

const TIMEZONES = [
  ['America/New_York', 0.5],
  ['America/Chicago', 0.2],
  ['America/Los_Angeles', 0.25],
  ['Europe/London', 0.05]
];

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function weighted(random, pairs) {
  let r = random();
  for (const [v, w] of pairs) {
    if ((r -= w) <= 0) return v;
  }
  return pairs[pairs.length - 1][0];
}

function loadSeedSignals(fromDay, toDay) {
  const file = path.join(process.cwd(), 'track-record-reads.json');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    method: parsed.method || null,
    reads: (parsed.reads || []).filter((r) => r.date >= fromDay && r.date <= toDay && r.found_at).sort((a, b) => a.found_at.localeCompare(b.found_at))
  };
}

const QUESTIONS = ['what did $T print today?', '$T dark pool?', 'any big prints on $T', 'how unusual was the $T volume?', 'where is $T trading', '$T flow this week'];
const BACKTESTS = ['BT $T', 'backtest $T straddles', 'compare calls vs puts on $T over 45 days', 'BT $T by win rate', 'backtest $T', 'BT $ILLQ'];
const SETTINGS = ['fewer alerts please', 'set my min notional to $500M', 'what are my settings?', 'only send me $T alerts'];
const SMALL = ['thanks', 'gm', 'ok cool', 'got it, thank you'];
const AFTER_ALERT = ['MORE', 'BT', 'why does this matter?', 'MORE', 'BT'];

export async function seedKimi({ days = 56, userCount = 46, seed = 7, now = new Date(), log = () => {} } = {}) {
  const mode = describeDb().mode;
  if (mode === 'firestore' || process.env.NODE_ENV === 'production') throw new Error('Refusing to seed: Kimi seed data is for the local dev store only.');

  const random = rng(seed);
  const startDay = addDays(usageDay(now), -(days - 1));
  const today = usageDay(now);
  const clock = new SimClock(startOfLocalDay(startDay, ET).getTime());
  const prev = { dry: process.env.KIMI_DRY_RUN, alerts: process.env.KIMI_ALERTS_ENABLED };
  process.env.KIMI_DRY_RUN = 'false';
  process.env.KIMI_ALERTS_ENABLED = 'true';
  setClock(() => clock.ms);
  const provider = new SeedMessagingProvider(random);
  setMessagingProviderForTests(provider);
  setLlmProviderForTests(seedLlm(random, clock));
  setBackendForTests(seedBackend(random, clock));
  setFileAutoFlush(false);

  const counts = { users: 0, verified: 0, inbound: 0, alerts: 0, backtests: 0 };
  try {
    const { method, reads } = loadSeedSignals(startDay, today);
    const tickers = [...new Set(reads.map((r) => r.ticker))].concat(['NVDA', 'AAPL', 'TSLA', 'AMD']);

    // Users: signups spread over the window, more recently.
    const users = [];
    for (let i = 0; i < userCount; i += 1) {
      const offset = Math.floor(Math.pow(random(), 0.8) * (days - 2));
      const signupDay = addDays(startDay, offset);
      const tz = weighted(random, TIMEZONES);
      const phone = `+1${pick(random, ['415', '212', '312', '646', '310', '617', '305', '512'])}555${String(100 + i).padStart(4, '0')}`;
      users.push({
        uid: `seed_user_${String(i + 1).padStart(2, '0')}`,
        email: `trader${i + 1}@example.com`,
        phone,
        tz,
        plan: random() < 0.58 ? 'pro' : 'free',
        signupDay,
        startsVerification: random() < 0.86,
        completes: random() < 0.82,
        engagement: 0.15 + random() * 0.55,
        sms: random() < 0.3,
        webUser: random() < 0.35,
        churnsAfter: random() < 0.25 ? Math.floor(7 + random() * 21) : null
      });
    }
    users.filter((u) => u.sms).forEach((u) => provider.smsNumbers.add(u.phone));

    const actions = [];
    const schedule = (ms, fn) => actions.push({ ms, fn });
    const atLocal = (day, tz, hour, minute = 0) => startOfLocalDay(day, tz).getTime() + (hour * 60 + minute) * 60000;

    for (const u of users) {
      schedule(atLocal(u.signupDay, u.tz, 9 + Math.floor(random() * 12), Math.floor(random() * 60)), async () => {
        await ensureProfile(u.uid, { email: u.email, plan: u.plan, at: clockNow().toISOString() });
        counts.users += 1;
        if (!u.startsVerification) return;
        const user = { uid: u.uid, email: u.email };
        await startPhoneVerification({ user, phone: u.phone });
        if (!u.completes) return;
        clock.advance(40000 + random() * 120000);
        const code = (provider.sent.filter((m) => m.to === u.phone).at(-1)?.text.match(/\b(\d{6})\b/) || [])[1];
        await confirmPhoneVerification({ user, code, consent: true, consentVersion: KIMI_CONFIG.consent.version, ip: `203.0.113.${Math.floor(random() * 200) + 1}`, userAgent: 'Mozilla/5.0 (seed)' });
        const prefs = { quiet_hours: { enabled: random() < 0.7, start: '22:00', end: '07:00' }, max_alerts_per_day: pick(random, [3, 5, 5, 5, 8]) };
        const style = random();
        if (style < 0.25) prefs.watchlist = { mode: 'custom', tickers: Array.from({ length: 4 }, () => pick(random, tickers)), sectors: [], muted: [] };
        else if (style < 0.35) prefs.watchlist = { mode: 'custom', tickers: [], sectors: [pick(random, ['Technology', 'Healthcare', 'Financials'])], muted: [] };
        if (random() < 0.15) prefs.digest = { enabled: true, interval_minutes: pick(random, [30, 60]) };
        if (random() < 0.1) prefs.market_hours_only = true;
        if (random() < 0.2) prefs.min_notional = pick(random, [250e6, 500e6]);
        await updateProfile(u.uid, { timezone: u.tz, preferences: prefs });
        counts.verified += 1;
      });
    }

    // Users texting Kimi.
    for (let d = startDay; d <= today; d = addDays(d, 1)) {
      for (const u of users) {
        if (d <= u.signupDay || !u.startsVerification || !u.completes) continue;
        const age = Math.round((new Date(`${d}T12:00:00Z`) - new Date(`${u.signupDay}T12:00:00Z`)) / 86400000);
        if (u.churnsAfter && age > u.churnsAfter) continue;
        if (random() > u.engagement * (age < 7 ? 1.2 : 0.8)) continue;
        const n = 1 + Math.floor(random() * 2);
        for (let k = 0; k < n; k += 1) {
          const kind = random();
          const t = pick(random, tickers);
          const text = (kind < 0.45 ? pick(random, QUESTIONS) : kind < 0.62 ? pick(random, BACKTESTS) : kind < 0.75 ? pick(random, SETTINGS) : kind < 0.97 ? pick(random, SMALL) : pick(random, ['this is useless, the link didn\'t work', 'wtf why so many texts', 'should I buy $T calls right now?'])).replace(/\$T/g, `$${t}`);
          const web = u.webUser && random() < 0.5;
          schedule(atLocal(d, u.tz, 8 + Math.floor(random() * 13), Math.floor(random() * 60)), async () => {
            const profile = await getProfile(u.uid);
            if (!profile?.sms_enabled) return;
            if (web) await handleAgentTurn({ userId: u.uid, text, channel: 'web', receivedAt: clockNow() });
            else await processInbound({ adapter: provider, inbound: { providerMessageId: `seedin_${u.uid}_${clockNow().getTime()}`, from: u.phone, text, media: [], receivedAt: clockNow().toISOString(), channel: u.sms ? 'sms' : 'imessage' } });
            counts.inbound += 1;
            if (web && random() < 0.4) {
              await emitEvent('feedback_given', { userId: u.uid, channel: 'web', properties: { rating: random() < 0.82 ? 'up' : 'down', comment: null } });
            }
          });
        }
      }
      // Unknown numbers texting in.
      if (random() < 0.3) {
        schedule(atLocal(d, ET, 10 + Math.floor(random() * 8)), async () => {
          await processInbound({ adapter: provider, inbound: { providerMessageId: `seedunk_${d}`, from: `+1917555${String(Math.floor(random() * 90) + 10).padStart(4, '0')}`, text: pick(random, ['hi', 'what is this', 'stock tips?']), media: [], receivedAt: clockNow().toISOString() } });
        });
      }
      if (random() < 0.12) schedule(atLocal(d, ET, 3), () => emitEvent('webhook_rejected', { properties: { provider: 'sendblue', reason: 'invalid_signature' } }));
    }

    // Backend signals, consumed shortly after they were published.
    for (const read of reads) {
      schedule(new Date(read.found_at).getTime() + 45000 + random() * 60000, async () => {
        const res = await consumeSignal(read, { provider, paramVersion: method });
        counts.alerts += res.sent || 0;
        const deliveries = (await queryDeliveries({ alertId: `${read.ticker}__${read.date}` })).filter((x) => x.status === 'sent');
        for (const del of deliveries) {
          const u = users.find((x) => x.uid === del.user_id);
          const sentMs = new Date(del.sent_at).getTime();
          schedule(sentMs + 1500 + random() * 5000, () =>
            recordDeliveryReceipt({ messageId: del.message_ids?.[0] || null, userId: del.user_id, alertId: del.alert_id, status: 'delivered', at: clockNow() })
          );
          if (random() < 0.32) schedule(sentMs + 60000 + random() * 1800000, () => resolveShortLink(del.short_code));
          if (random() < 0.27) {
            schedule(sentMs + 120000 + random() * 2700000, async () => {
              await processInbound({ adapter: provider, inbound: { providerMessageId: `seedreply_${del.id}`, from: u.phone, text: pick(random, AFTER_ALERT), media: [], receivedAt: clockNow().toISOString(), channel: u.sms ? 'sms' : 'imessage' } });
              counts.inbound += 1;
            });
          }
          const roll = random();
          if (roll < 0.025) {
            schedule(sentMs + 600000 + random() * 3600000 * 6, () => processInbound({ adapter: provider, inbound: { providerMessageId: `seedpause_${del.id}`, from: u.phone, text: 'PAUSE', media: [], receivedAt: clockNow().toISOString() } }));
          } else if (roll < 0.04) {
            const stopMs = sentMs + 900000 + random() * 3600000 * 10;
            schedule(stopMs, () => processInbound({ adapter: provider, inbound: { providerMessageId: `seedstop_${del.id}`, from: u.phone, text: 'STOP', media: [], receivedAt: clockNow().toISOString() } }));
            if (random() < 0.4) schedule(stopMs + 86400000 * (1 + random() * 4), () => processInbound({ adapter: provider, inbound: { providerMessageId: `seedstart_${del.id}`, from: u.phone, text: 'START', media: [], receivedAt: clockNow().toISOString() } }));
          }
        }
      });
    }

    // Hourly digest flushes.
    for (let d = startDay; d <= today; d = addDays(d, 1)) {
      for (let h = 0; h < 24; h += 1) schedule(atLocal(d, ET, h, 5), () => flushDigests({ provider }));
    }

    const endMs = now.getTime();
    let processed = 0;
    while (actions.length) {
      actions.sort((a, b) => a.ms - b.ms);
      const next = actions.shift();
      if (next.ms > endMs) continue;
      clock.set(next.ms);
      try {
        await next.fn();
      } catch (err) {
        // Simulated carrier failures and similar errors are part of the data.
        counts.errors = (counts.errors || 0) + 1;
      }
      await flushBackgroundTasks();
      processed += 1;
      if (processed % 250 === 0) log(`  …${processed} actions, at ${new Date(clock.ms).toISOString().slice(0, 16)}`);
    }

    clock.set(endMs);
    await updateForwardReturns({ lookbackDays: days + 5, limit: 500 });
    counts.backtests = (await queryBacktests()).length;
    await buildRollups({ fromDay: startDay, toDay: today });
  } finally {
    setClock(null);
    setMessagingProviderForTests(null);
    setLlmProviderForTests(undefined);
    setBackendForTests(null);
    setFileAutoFlush(true);
    flushDb();
    process.env.KIMI_DRY_RUN = prev.dry;
    process.env.KIMI_ALERTS_ENABLED = prev.alerts;
    if (prev.dry === undefined) delete process.env.KIMI_DRY_RUN;
    if (prev.alerts === undefined) delete process.env.KIMI_ALERTS_ENABLED;
  }
  return { ...counts, fromDay: startDay, toDay: today };
}
