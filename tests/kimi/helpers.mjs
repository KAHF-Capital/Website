// Shared test harness: in-memory store, mock messaging provider, scripted LLM,
// fake backend adapters and a controllable clock. No network access.

process.env.NODE_ENV = 'test';
process.env.KIMI_PUBLIC_BASE_URL = 'https://kimi.test';

import { useMemoryDb } from '../../lib/kimi/db.js';
import { MockMessagingProvider, setMessagingProviderForTests } from '../../lib/kimi/messaging/index.js';
import { setLlmProviderForTests } from '../../lib/kimi/llm.js';
import { setBackendForTests, signalIdOf } from '../../lib/kimi/backend.js';
import { addDays, clockNow, flushBackgroundTasks, setClock } from '../../lib/kimi/runtime.js';
import { claimPhone, ensureProfile, phoneFields, updateProfile } from '../../lib/kimi/store.js';
import { analyzeOptionsProfitability } from '../../lib/options-analysis-service.js';

export { flushBackgroundTasks, clockNow, signalIdOf };

export class TestClock {
  constructor(iso) {
    this.t = new Date(iso).getTime();
  }
  get now() {
    return this.t;
  }
  set(iso) {
    this.t = new Date(iso).getTime();
  }
  advance(ms) {
    this.t += ms;
  }
}

// 26 one-month windows in the backend's convention: percentMove = (later - earlier) / earlier.
export const MOVES = [0.12, -0.04, 0.03, -0.09, 0.07, 0.01, -0.02, 0.15, -0.11, 0.05, 0.02, -0.06, 0.09, -0.01, 0.04, -0.13, 0.06, 0.0, -0.03, 0.08, -0.07, 0.1, -0.05, 0.02, 0.11, -0.08];

export function makeWindows(moves = MOVES) {
  return moves.map((m, i) => {
    const earlier = addDays('2024-01-02', i * 30);
    return { startDate: addDays(earlier, 30), endDate: earlier, startPrice: 100 * (1 + m), endPrice: 100, percentMove: m };
  });
}

export function makeSignal(overrides = {}) {
  return {
    date: '2026-11-05',
    ticker: 'CSX',
    volume_ratio: 3.02,
    dark_pool_value: 630282815.82,
    dark_pool_avg_price: 51.568,
    structure: 'straddle',
    direction: 'bullish',
    strike: 52,
    expiration: '2026-12-18',
    dte: 30,
    entry_premium: 2.69,
    asof_hit_rate: 64,
    asof_samples: 25,
    contracts: ['O:CSX261218C00052000', 'O:CSX261218P00052000'],
    found_at: clockNow().toISOString(),
    ...overrides
  };
}

export function fakeBackend(state = {}) {
  const windows = state.windows || makeWindows();
  return {
    structures: ['call', 'put', 'straddle'],
    structureLabel: (s) => (s === 'call' ? 'Long Call' : s === 'put' ? 'Long Put' : 'ATM Straddle'),
    loadPublishedSignals: async () => {
      const signals = (state.signals || []).map((read) => ({ id: signalIdOf(read), read, feed: 'latest' }));
      return {
        ok: state.feedOk !== false,
        historyOk: state.feedOk !== false,
        source: 'test',
        method: state.method || 'walk-forward test method',
        generatedAt: state.generatedAt || clockNow().toISOString(),
        historySince: '2026-01-01',
        signals,
        rejected: state.rejected || []
      };
    },
    getRecentPrints: async ({ ticker }) => ({
      ticker: ticker || null,
      sessions: [{ ticker: ticker || 'NVDA', date: '2026-11-04', shares: 12000000, notional_usd: 1480000000, avg_price: 123.45, trade_count: 900, volume_ratio_vs_7d: 4.1 }],
      granularity: 'session aggregate'
    }),
    getPreviousClose: async (ticker) => ({ ticker, price: 125.5, basis: 'previous session close' }),
    getDailyBars: async () => state.bars || [],
    getLiveOptionQuote:
      state.getLiveOptionQuote ||
      (async (ticker, expiration, structure) => ({
        strikePrice: 100,
        premium: structure === 'straddle' ? 7 : 3.5,
        expiration: addDays(clockNow().toISOString().slice(0, 10), 30),
        currentPrice: 100,
        callPrice: 3.5,
        putPrice: 3.5
      })),
    runStructureBacktest: async (config) => {
      const p = config.premium / config.strikePrice;
      const analysis = analyzeOptionsProfitability(windows, {
        strategy: config.strategy,
        upperBreakevenPct: config.strategy === 'put' ? undefined : p,
        lowerBreakevenPct: config.strategy === 'call' ? undefined : -p
      });
      return { ...analysis, historyYears: 2.1, historyAsOf: config.asOfDate || '2026-11-05' };
    },
    getAnalysisWindows: async () => ({ windows, overlapping: false, historyStart: '2024-01-02', historyEnd: '2026-11-05' }),
    markSignal: async () => null,
    getTickerSector: async () => ({ sector: state.sector || 'Industrials' })
  };
}

export function setup({ dryRun = false, alertsEnabled = true, llm = null, backend = {}, clock = null } = {}) {
  process.env.KIMI_DRY_RUN = dryRun ? 'true' : 'false';
  process.env.KIMI_ALERTS_ENABLED = alertsEnabled ? 'true' : 'false';
  process.env.KIMI_MAX_SIGNAL_AGE_MINUTES = '15';
  useMemoryDb();
  const provider = new MockMessagingProvider({ secret: 'test-secret' });
  setMessagingProviderForTests(provider);
  setLlmProviderForTests(llm);
  setBackendForTests(fakeBackend(backend));
  setClock(clock ? () => clock.now : null);
  return { provider, backendState: backend };
}

export async function createUser({ userId = 'user_a', phone = '+14155550101', timezone = 'America/New_York', plan = 'pro', prefs = {} } = {}) {
  await ensureProfile(userId, { email: `${userId}@test.dev`, plan });
  await claimPhone(userId, phone);
  const at = clockNow().toISOString();
  return updateProfile(userId, {
    ...phoneFields(phone),
    phone_verified_at: at,
    consent_at: at,
    consent_version: 'test',
    timezone,
    preferences: {
      quiet_hours: { enabled: false, start: '22:00', end: '07:00' },
      ...prefs
    }
  });
}

/** A scripted LLM. `respond(request, index)` returns { content, usage, stopReason }. */
export class ScriptedLlm {
  constructor(respond) {
    this.name = 'scripted';
    this.respond = respond;
    this.calls = [];
  }
  async createMessage(request) {
    this.calls.push(request);
    return this.respond(request, this.calls.length - 1);
  }
  get replyCalls() {
    return this.calls.filter((c) => !isClassifyCall(c) && !isSummaryCall(c));
  }
}

export function isClassifyCall(req) {
  return typeof req.system === 'string' && req.system.includes('You label text messages');
}

export function isSummaryCall(req) {
  return typeof req.system === 'string' && req.system.includes('compact memory');
}

export function textResponse(text, usage = { input_tokens: 600, output_tokens: 40 }) {
  return { content: [{ type: 'text', text }], usage, stopReason: 'end_turn' };
}

export function toolUseResponse(name, input, id = `tu_${Math.random().toString(36).slice(2)}`) {
  return { content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 700, output_tokens: 30 }, stopReason: 'tool_use' };
}

export function classifyResponse(intent = 'market_question') {
  return textResponse(JSON.stringify({ intent, frustrated: false, advice_request: false }), { input_tokens: 120, output_tokens: 20 });
}

export function inbound(text, { from = '+14155550101', id = null, channel = 'imessage' } = {}) {
  return { providerMessageId: id || `pm_${Math.random().toString(36).slice(2)}`, from, text, media: [], receivedAt: clockNow().toISOString(), channel };
}

export function mockRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    }
  };
}
