import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { buildAlignedScannerContext, extractSignalDate } from '../../lib/kahf-scanner-context';
import { verifyIdToken, isFirebaseAdminConfigured, getFirestoreAdmin, ensureProAccess } from '../../lib/firebase-admin';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getAllStrategyAnalyses } from '../../lib/options-analysis-service.js';
import { isProStatus } from '../../lib/subscription-access';
import {
  POLYGON_API_BASE,
  SCANNER_MIN_VOLUME,
  SCANNER_MIN_PRICE,
  SIGNAL_MIN_VOLUME_RATIO,
  detectCatalysts
} from '../../lib/scanner-signals';

const ANON_LIMIT = parseInt(process.env.KAHF_AI_ANON_MESSAGE_LIMIT || '1', 10);
// Signed-in but not subscribed: small monthly quota (encourages signup, gates Pro).
const FREE_ACCOUNT_LIMIT = parseInt(process.env.KAHF_AI_FREE_ACCOUNT_LIMIT || '5', 10);
const MAX_CONTEXT_TICKERS = 12;
const MAX_STRADDLE_TICKERS = 5;
const MAX_RESEARCH_TICKERS = 5;
const SCANNER_LOOKBACK_DAYS = parseInt(process.env.KAHF_AI_LOOKBACK_DAYS || '8', 10);
const TOP_PER_DAY = 5;
const MAX_HISTORY_TICKERS_IN_PROMPT = 4;

const WEB_SEARCH_ENABLED = (process.env.KAHF_AI_WEB_SEARCH || 'true').toLowerCase() !== 'false';
const WEB_SEARCH_MAX_USES = parseInt(process.env.KAHF_AI_WEB_SEARCH_USES || '3', 10);

// Primary model + automatic fallbacks. If the configured model is unavailable
// (retired, typo'd env var, or no access) the provider returns a 404. Rather
// than surface that to the user we fall through this list so the chat keeps working.
const PRIMARY_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const MODEL_FALLBACKS = ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-opus-4-7'];

// Some current models reject the `temperature` sampling parameter with a 400.
// Only set it for models that still accept it.
function modelSupportsTemperature(model) {
  return !/opus-4-[789]|opus-[5-9]|sonnet-4-[6-9]|sonnet-[5-9]|fable|mythos/i.test(model || '');
}

function isModelUnavailableError(error) {
  const status = error?.status || error?.statusCode;
  return status === 404 || /not_found_error|model:/i.test(error?.message || '');
}

const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || (process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')}/api/mcp` : '');
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const MCP_ENABLED = (process.env.KAHF_AI_MCP_ENABLED || 'true').toLowerCase() !== 'false' && Boolean(MCP_PUBLIC_URL);

const anonymousUsage = new Map();

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 48);
}

function getPeriodKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((message) => message && ['user', 'assistant'].includes(message.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 2500)
    }))
    .filter((message) => message.content.trim())
    .slice(-10);
}

function extractTickers(messages) {
  // Common English words that look like tickers but never are. Polygon will 500
  // if we ask for them, so we filter them client-side.
  const ignored = new Set([
    'A', 'AN', 'I', 'AI', 'API', 'ATM', 'DTE', 'ETF', 'IV', 'ME', 'MY', 'NO', 'OR',
    'AND', 'BUT', 'IF', 'IS', 'IT', 'ON', 'TO', 'BE', 'AT', 'IN', 'OF', 'AS', 'BY',
    'WE', 'HE', 'SHE', 'WAS', 'ARE', 'CAN', 'WILL', 'WERE', 'BEEN', 'WHEN', 'WHERE',
    'WHAT', 'WHICH', 'WHO', 'HOW', 'READ', 'GIVE', 'TELL', 'MAKE', 'TAKE', 'SEEN',
    'SEE', 'LOOK', 'HELP', 'NEED', 'WANT', 'LIKE', 'GOOD', 'BAD', 'NEW', 'OLD',
    'NOW', 'THEN', 'JUST', 'ONLY', 'MORE', 'LESS', 'MOST', 'NEXT', 'LAST', 'BEST',
    'WORST', 'HIGH', 'LOW', 'BIG', 'SMALL', 'FULL', 'EMPTY', 'OPEN', 'CLOSE',
    'ASK', 'BUY', 'CALL', 'CHAT', 'DARK', 'FOR', 'GET', 'NEWS', 'POOL', 'PRICE',
    'PRO', 'PUT', 'QUICK', 'RESEARCH', 'SELL', 'SETUP', 'SHOW', 'THE', 'TOP',
    'TRADE', 'USD', 'US', 'VOL', 'WHY', 'YOU', 'KAHF', 'SCAN', 'STOP', 'PLAY',
    'INTO', 'WITH', 'FROM', 'OVER', 'UNDER', 'EACH', 'SOME', 'MANY', 'FEW', 'ANY',
    'ALL', 'BOTH', 'PAST', 'YEAR', 'WEEK', 'DAY', 'DAYS', 'HOUR', 'MIN', 'SEC', 'TIME',
    'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
    'SIGNAL', 'SIGNALS', 'HISTORY', 'RATIO', 'AVERAGE', 'PRINT', 'PRINTS', 'FLOW',
    'SESSION', 'SESSIONS', 'FLAG', 'FLAGGED', 'BEFORE', 'AFTER', 'SINCE', 'UNTIL'
  ]);
  const text = messages
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
    .join(' ');

  const dollarMatches = (text.match(/\$([A-Za-z]{1,5})\b/g) || [])
    .map((token) => token.replace('$', '').toUpperCase());
  const upperMatches = (text.toUpperCase().match(/\b[A-Z]{1,5}\b/g) || []);

  const candidates = [...dollarMatches, ...upperMatches]
    .filter((ticker) => !ignored.has(ticker));
  return [...new Set(candidates)].slice(0, MAX_CONTEXT_TICKERS);
}

async function getIdentity(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    const sessionId = String(req.body?.sessionId || '').slice(0, 120);
    const userAgent = req.headers['user-agent'] || 'unknown';
    const forwardedFor = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    return {
      type: 'anonymous',
      key: `anon:${hashValue(`${sessionId}:${forwardedFor}:${userAgent}`)}`,
      tier: 'anonymous',
      limit: ANON_LIMIT,
      isUnlimited: false,
      userData: null
    };
  }

  if (!isFirebaseAdminConfigured()) {
    const error = new Error(
      'Server is not configured for signed-in users. Add a Firebase service account in Vercel env vars (FIREBASE_SERVICE_ACCOUNT_BASE64).'
    );
    error.statusCode = 503;
    throw error;
  }

  const verified = await verifyIdToken(token);
  if (!verified.success) {
    const error = new Error(`Authentication failed: ${verified.error || 'Invalid token'}`);
    error.statusCode = 401;
    throw error;
  }

  // Look up subscription status. Pro = active or trialing (shared helper).
  // If Firestore still says free, cheaply claim a parked pending doc (no live
  // Stripe call on the chat hot path — deep recovery lives on the success page
  // and the "I already paid" button).
  let isPro = false;
  let userData = null;
  try {
    const firestore = getFirestoreAdmin();
    const snap = await firestore.collection('users').doc(verified.uid).get();
    if (snap.exists) {
      userData = snap.data();
      isPro = isProStatus(userData?.subscription?.status);
    }
    if (!isPro) {
      const healed = await ensureProAccess(verified.uid, verified.email, { deep: false });
      userData = healed.userData || userData;
      isPro = healed.isPro;
      if (healed.healed) {
        console.log(`[kahf-ai-chat] Auto-healed Pro for ${verified.email} → ${healed.status}`);
      }
    }
  } catch (err) {
    console.error('[kahf-ai-chat] Could not read/heal subscription for', verified.uid, err.message);
  }

  if (isPro) {
    return {
      type: 'pro',
      key: `uid:${verified.uid}`,
      uid: verified.uid,
      email: verified.email,
      tier: 'pro',
      limit: null,
      isUnlimited: true,
      userData
    };
  }

  return {
    type: 'free_account',
    key: `uid:${verified.uid}`,
    uid: verified.uid,
    email: verified.email,
    tier: 'free',
    limit: FREE_ACCOUNT_LIMIT,
    isUnlimited: false,
    userData
  };
}

// Persistent monthly usage counter for signed-in free users (survives Vercel cold starts).
async function incrementFirestoreUsage(uid, period, limit) {
  const firestore = getFirestoreAdmin();
  const ref = firestore.collection('users').doc(uid).collection('usage').doc(period);
  return firestore.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const current = snap.exists ? Number(snap.data().count || 0) : 0;
    if (current >= limit) {
      const error = new Error('You\'ve used your free KAHF AI messages this month. Start a 7-day Pro free trial for unlimited access.');
      error.statusCode = 429;
      error.usage = { tier: 'free', limit, used: current, remaining: 0, isUnlimited: false, period };
      throw error;
    }
    const next = current + 1;
    txn.set(ref, { count: next, updatedAt: new Date().toISOString() }, { merge: true });
    return next;
  });
}

async function reserveUsage(identity) {
  const period = getPeriodKey();

  if (identity.isUnlimited) {
    return {
      tier: identity.tier,
      limit: null,
      used: 0,
      remaining: null,
      isUnlimited: true,
      period
    };
  }

  const limit = identity.limit;

  // Signed-in free users: persist count in Firestore so the limit holds across cold starts.
  if (identity.tier === 'free' && identity.uid) {
    try {
      const used = await incrementFirestoreUsage(identity.uid, period, limit);
      return {
        tier: identity.tier,
        limit,
        used,
        remaining: Math.max(limit - used, 0),
        isUnlimited: false,
        period
      };
    } catch (err) {
      if (err.statusCode === 429) throw err;
      console.error('[kahf-ai-chat] Firestore usage failed, falling back to in-memory:', err.message);
      // fall through to in-memory below
    }
  }

  // Anonymous (or Firestore fallback): in-memory counter.
  const fallbackKey = `${period}:${identity.key}`;
  const currentCount = anonymousUsage.get(fallbackKey) || 0;
  if (currentCount >= limit) {
    const error = new Error(
      identity.tier === 'free'
        ? 'You\'ve used your free KAHF AI messages this month. Start a 7-day Pro free trial for unlimited access.'
        : 'You used your free KAHF AI message. Sign in or upgrade to Pro for more.'
    );
    error.statusCode = 429;
    error.usage = {
      tier: identity.tier,
      limit,
      used: currentCount,
      remaining: 0,
      isUnlimited: false,
      period
    };
    throw error;
  }

  const nextCount = currentCount + 1;
  anonymousUsage.set(fallbackKey, nextCount);

  return {
    tier: identity.tier,
    limit,
    used: nextCount,
    remaining: Math.max(limit - nextCount, 0),
    isUnlimited: false,
    period
  };
}

async function buildScannerContext(requestedTickers, namedDate) {
  return buildAlignedScannerContext(requestedTickers, namedDate, {
    maxContextTickers: MAX_CONTEXT_TICKERS,
    lookbackDays: SCANNER_LOOKBACK_DAYS,
    topPerDay: TOP_PER_DAY,
    maxHistoryTickers: MAX_HISTORY_TICKERS_IN_PROMPT,
    minVolume: SCANNER_MIN_VOLUME,
    minPrice: SCANNER_MIN_PRICE,
    minRatio: SIGNAL_MIN_VOLUME_RATIO
  });
}

async function buildOptionsContext(tickers, asOfDate) {
  if (!process.env.POLYGON_API_KEY || tickers.length === 0) {
    return {
      available: false,
      reason: process.env.POLYGON_API_KEY ? 'No tickers requested' : 'Polygon API key not configured'
    };
  }

  // For each ticker, score all three strategies (call/put/straddle) so the AI
  // can pick the directional read with the best edge, not just default to straddle.
  const analyses = await Promise.all(
    tickers.slice(0, MAX_STRADDLE_TICKERS).map(async (ticker) => {
      try {
        const strategies = await getAllStrategyAnalyses(ticker, { asOfDate: asOfDate || null });
        if (!strategies.call && !strategies.put && !strategies.straddle) {
          return { ticker, unavailable: true };
        }
        // Best historical edge across the three strategies (for AI ranking).
        const candidates = [strategies.call, strategies.put, strategies.straddle].filter(Boolean);
        const best = candidates.reduce((a, b) => (a.successRate >= b.successRate ? a : b));
        return {
          ticker,
          strategies,
          bestStrategy: best?.strategy,
          bestSuccessRate: best?.successRate,
          flow: deriveFlowSignal(strategies),
          valuation: derivePricedInSignal(strategies)
        };
      } catch (err) {
        console.warn(`[buildOptionsContext] ${ticker} failed:`, err.message);
        return { ticker, unavailable: true, error: err.message };
      }
    })
  );

  return {
    available: true,
    analyses,
    fieldGlossary: {
      strategies: 'For each ticker: { call, put, straddle } each with successRate, breakevens, liquidity, IV, premium, dte.',
      bestStrategy: 'Which of the three (call/put/straddle) has the highest historical hit rate for this ticker at ~30 DTE.',
      bestSuccessRate: 'The highest of the three historical hit rates. Cite it as a statistic. Do not rank tickers into a trade list from it.',
      flow: 'Options flow direction: cpVolumeRatio (call vol / put vol) and cpOIRatio (call OI / put OI) today, plus lean (bullish/bearish/neutral). >1.3 vol = call-heavy/bullish lean; <0.77 = put-heavy/bearish lean. This is Factor 2 (Directional signal).',
      valuation: 'Priced-in gauge (Factor 5): impliedMovePct = ATM straddle premium / strike (the move the options are pricing); realizedAvgMovePct = average historical move over the same window; pricedInRatio = implied / realized; verdict ("cheap" <0.9, "fair" 0.9-1.2, "rich/priced-in" >1.2). Rich means the implied move is rich versus the historical realized move. Report that. Do not tell the user to buy a spread or skip a long option.'
    }
  };
}

// Factor 2 — directional signal from current options flow (call vs put).
function deriveFlowSignal(strategies) {
  const liq = strategies.straddle?.liquidity || strategies.call?.liquidity || strategies.put?.liquidity;
  if (!liq) return { available: false };
  const cv = liq.callVolume || 0;
  const pv = liq.putVolume || 0;
  const co = liq.callOpenInterest || 0;
  const po = liq.putOpenInterest || 0;
  const cpVolumeRatio = pv > 0 ? Number((cv / pv).toFixed(2)) : null;
  const cpOIRatio = po > 0 ? Number((co / po).toFixed(2)) : null;
  let lean = 'neutral';
  const ref = cpVolumeRatio ?? cpOIRatio;
  if (ref != null) {
    if (ref >= 1.3) lean = 'bullish';
    else if (ref <= 0.77) lean = 'bearish';
  }
  return { available: true, cpVolumeRatio, cpOIRatio, lean };
}

// Factor 5 — is the expected move already priced into the options?
function derivePricedInSignal(strategies) {
  const s = strategies.straddle;
  if (!s || !s.strikePrice || !s.premium) return { available: false };
  const impliedMovePct = Number(((s.premium / s.strikePrice) * 100).toFixed(1));
  // Realized average move over the same window (abs of up/down legs).
  const up = Math.abs(s.avgUpMove || 0);
  const down = Math.abs(s.avgDownMove || 0);
  const realizedAvgMovePct = up || down ? Number(((up + down) / 2).toFixed(1)) : null;
  let pricedInRatio = null;
  let verdict = 'unknown';
  if (realizedAvgMovePct && realizedAvgMovePct > 0) {
    pricedInRatio = Number((impliedMovePct / realizedAvgMovePct).toFixed(2));
    verdict = pricedInRatio > 1.2 ? 'rich' : pricedInRatio < 0.9 ? 'cheap' : 'fair';
  }
  return { available: true, impliedMovePct, realizedAvgMovePct, pricedInRatio, verdict };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KAHF-Capital-AI/1.0',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Research request failed: ${response.status}`);
  }

  return response.json();
}

async function getPolygonNews(ticker, asOfDate) {
  if (!process.env.POLYGON_API_KEY) {
    return { ticker, unavailable: true, reason: 'Polygon API key not configured', source: 'polygon' };
  }
  try {
    const cutoff = asOfDate ? `&published_utc.lte=${encodeURIComponent(`${asOfDate}T23:59:59Z`)}` : '';
    const data = await fetchJson(
      `${POLYGON_API_BASE}/v2/reference/news?ticker=${encodeURIComponent(ticker)}&limit=8&order=desc&sort=published_utc&apiKey=${process.env.POLYGON_API_KEY}${cutoff}`
    );
    const items = (data.results || []).slice(0, 8);
    if (items.length === 0) {
      return { ticker, source: 'polygon', news: [], catalysts: [], asOfDate: asOfDate || null, lookahead: false };
    }
    const news = items.map((item) => {
      const titleAndDesc = `${item.title || ''} ${item.description || ''}`;
      return {
        title: item.title,
        publisher: item.publisher?.name || item.author || null,
        publishedAt: item.published_utc || null,
        url: item.article_url || null,
        catalysts: detectCatalysts(titleAndDesc),
        keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6) : []
      };
    }).filter((item) => !asOfDate || !item.publishedAt || item.publishedAt.slice(0, 10) <= asOfDate);
    const catalysts = [...new Set(news.flatMap((item) => item.catalysts))];
    return { ticker, source: 'polygon', news, catalysts, asOfDate: asOfDate || null, lookahead: false };
  } catch (error) {
    console.warn(`Polygon news unavailable for ${ticker}:`, error.message);
    return { ticker, source: 'polygon', unavailable: true, reason: error.message };
  }
}

async function getYahooFallback(ticker, asOfDate) {
  try {
    const data = await fetchJson(
      `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=5`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; KAHFAI/1.0)',
          Accept: 'application/json,text/plain,*/*'
        }
      }
    );
    const news = (data.news || []).slice(0, 5).map((item) => ({
      title: item.title,
      publisher: item.publisher,
      publishedAt: item.providerPublishTime
        ? new Date(item.providerPublishTime * 1000).toISOString()
        : null,
      url: item.link,
      catalysts: detectCatalysts(item.title || '')
    })).filter((item) => !asOfDate || !item.publishedAt || item.publishedAt.slice(0, 10) <= asOfDate);
    return { ticker, source: 'yahoo', news, catalysts: [...new Set(news.flatMap((n) => n.catalysts))], asOfDate: asOfDate || null, lookahead: false };
  } catch (error) {
    return { ticker, source: 'yahoo', unavailable: true, reason: error.message };
  }
}

async function getNewsResearch(ticker, asOfDate) {
  const polygon = await getPolygonNews(ticker, asOfDate);
  if (!polygon.unavailable && Array.isArray(polygon.news) && polygon.news.length > 0) {
    return polygon;
  }
  const yahoo = await getYahooFallback(ticker, asOfDate);
  if (!yahoo.unavailable && Array.isArray(yahoo.news) && yahoo.news.length > 0) {
    return yahoo;
  }
  return polygon.unavailable ? polygon : yahoo;
}

async function getPriceResearch(ticker, asOfDate) {
  try {
    if (!process.env.POLYGON_API_KEY) {
      return { ticker, unavailable: true, reason: 'Polygon API key not configured' };
    }
    if (asOfDate) {
      const start = new Date(new Date(`${asOfDate}T12:00:00Z`).getTime() - 10 * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const history = await getHistoricalStockData(ticker, start, asOfDate);
      const bar = [...history].reverse().find((day) => day.date <= asOfDate);
      if (!bar) return { ticker, asOfDate, unavailable: true, lookahead: false, reason: 'No close on or before that date' };
      return {
        ticker,
        price: bar.close,
        asOf: bar.date,
        lookahead: false,
        source: 'daily close on or before the signal date'
      };
    }

    const price = await getCurrentStockPrice(ticker);
    return {
      ticker,
      price,
      source: 'site price API'
    };
  } catch (error) {
    console.warn(`Price research unavailable for ${ticker}:`, error.message);
    return {
      ticker,
      unavailable: true,
      reason: error.message
    };
  }
}

async function buildResearchContext(tickers, asOfDate) {
  const researchTickers = tickers.slice(0, MAX_RESEARCH_TICKERS);
  const [prices, news] = await Promise.all([
    Promise.all(researchTickers.map((ticker) => getPriceResearch(ticker, asOfDate))),
    Promise.all(researchTickers.map((ticker) => getNewsResearch(ticker, asOfDate)))
  ]);

  const catalystMap = {};
  for (const item of news) {
    if (item.catalysts && item.catalysts.length > 0) {
      catalystMap[item.ticker] = item.catalysts;
    }
  }

  return {
    enabled: true,
    scope: 'Polygon news (primary) + Yahoo Finance (fallback) pre-fetched for top scanner tickers. Use the web_search tool for live questions or anything outside this list.',
    webSearchEnabled: WEB_SEARCH_ENABLED,
    prices,
    news,
    catalystMap
  };
}

async function buildMarketContext(messages) {
  const requestedTickers = extractTickers(messages);
  const namedDate = extractSignalDate(messages);
  const scanner = await buildScannerContext(requestedTickers, namedDate);
  const asOfDate = scanner.asOfDate || null;
  const tradableSet = new Set(scanner.tradableTickers || []);

  if (MCP_ENABLED) {
    return {
      requestedTickers,
      asOfDate,
      scanner,
      options: {
        available: false,
        asOfDate,
        reason: asOfDate
          ? `Use get_options_analysis with asOfDate ${asOfDate}. The hit rate must not include prices after that date. Live premiums are not the premiums from that date.`
          : 'Use the kahf-data MCP tool `get_options_analysis` (strategy: call|put|straddle) on demand.'
      },
      straddle: { available: false, reason: 'Use get_options_analysis.' },
      research: {
        enabled: true,
        webSearchEnabled: WEB_SEARCH_ENABLED,
        asOfDate,
        scope: asOfDate
          ? `Past signal. Every tool call must include asOfDate ${asOfDate}. get_scanner_history returns the full tape through that date and withholds later days.`
          : 'Live data via the kahf-data MCP server tools (get_news, get_stock_price, get_scanner_history, etc.) plus web_search. get_scanner_history returns the full blob history with a point-in-time volume ratio on every date.'
      }
    };
  }

  const namedForOptions = requestedTickers.slice(0, MAX_STRADDLE_TICKERS);
  const tickersForOptions = asOfDate
    ? namedForOptions
    : (
      requestedTickers.filter((ticker) => tradableSet.has(ticker)).length > 0
        ? requestedTickers.filter((ticker) => tradableSet.has(ticker))
        : scanner.topSignals?.slice(0, MAX_STRADDLE_TICKERS).map((ticker) => ticker.ticker) || []
    );

  const tickersForResearch = (
    requestedTickers.length > 0
      ? requestedTickers
      : scanner.topSignals?.slice(0, MAX_RESEARCH_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const options = await buildOptionsContext(tickersForOptions, asOfDate);
  const research = await buildResearchContext(tickersForResearch, asOfDate);

  return {
    requestedTickers,
    asOfDate,
    scanner,
    options,
    straddle: options,
    research
  };
}

function buildSystemPrompt() {
  const mcpBlock = MCP_ENABLED
    ? [
        '# Tools (kahf-data MCP server) - PREFER these over relying on context alone',
        'You have direct access to KAHF\'s data via these MCP tools. Call them as needed.',
        '',
        '**Dark pool / scanner (KAHF proprietary):**',
        '- `get_scanner_signals(minVolumeRatio?, limit?, asOfDate?)` — scanner board. Omit asOfDate for today (same numbers as the Scanner page). Pass asOfDate for a past session; the volume ratio then uses only data through that date.',
        '- `get_recurring_signals(minDaysInTop?, lookbackDays?, minVolumeRatio?, asOfDate?)` — names in the daily top list on more than one session. Pass asOfDate so the lookback cannot see later days.',
        '- `get_scanner_history(ticker, asOfDate?, days?)` — FULL dark-pool history for one ticker: share volume, average price, dollar value, trade count, and point-in-time volume ratio on every archived date. Omit days to get the entire tape. Pass asOfDate to withhold every session after that date.',
        '- `get_scanner_day(date, ticker?, universe?)` — one session for every ticker, or one ticker. universe "signals" is the scanner filter; universe "all" pages the whole tape.',
        '',
        '**Live market data (Polygon — Stocks Developer plan, 15-min delayed):**',
        '- `get_stock_price(ticker, asOfDate?)` — live snapshot when asOfDate is omitted. For a past signal, pass asOfDate and you get the daily close on or before that date, not today\'s price.',
        '- `get_market_status()` — open/closed/pre-market/after-hours. Call once at the start of a session so you can frame "current" prices correctly.',
        '- `get_intraday_chart(ticker, timespan?, multiplier?, days?, asOfDate?)` — bars. Pass asOfDate for a past signal so bars after that date are dropped.',
        '- `get_prior_range(ticker, asOfDate?)` — prior trading day high/low/close.',
        '- `get_ticker_details(ticker)` — name, type (CS / ETF), sector, market cap, exchange. Use for context and to see whether a name is a common stock or an ETF.',
        '- `get_top_movers(direction?, limit?)` — today\'s biggest gainers / losers. Use for market color.',
        '- `get_dividends(ticker, limit?)` — upcoming/historical dividends. Large ex-divs distort calls/puts on the date — flag them.',
        '',
        '**Options data (Polygon — Options Basic plan):**',
        '- `get_options_analysis(ticker, strategy?, asOfDate?)` — 30-day ATM hit rate + premium + breakevens + liquidity + IV. Pass asOfDate for a past signal so the hit rate stops on that date. The premium on that response is today\'s live premium, not the premium that was listed on the past date — say so.',
        '- `get_options_chain(ticker, expirationDate?, strikeWindowPct?, contractType?)` — chain snapshot near ATM with IV + Greeks (delta/gamma/theta/vega) + OI per strike. Use this to quote a real contract. Do not use it to tell the user which strike to trade.',
        '- `get_option_quote(optionTicker, ticker?)` — live snapshot for a SINGLE contract (bid/ask, OI, IV, Greeks). Use after the chain narrows it down.',
        '- `get_straddle_analysis(ticker)` — LEGACY alias. Prefer `get_options_analysis`.',
        '',
        '**Catalysts & news:**',
        '- `get_news(ticker, limit?, asOfDate?)` — headlines. Pass asOfDate to drop anything published after that date.',
        '- `web_search(query)` — for live questions, earnings calendar lookups, and anything not in Polygon.',
        '',
        'Tool-use rules:',
        '- For ANY price you mention (stock or option), CALL THE APPROPRIATE TOOL. Never invent a number, never paraphrase old context.',
        '- Before you quote a specific option contract, call `get_options_chain` so the strike and premium are real.',
        '- Call `get_market_status` early so you can say "market is open, last trade 11:34am ET" vs "market closed at $X Friday".',
        '- Chain calls when a question needs multiple data points. Keep responses concise — the user does not need to see the tool calls themselves.',
        '- If the user asks about a past signal or names a date, every tool call for that question must include asOfDate. Do not describe today\'s price, today\'s volume ratio, or a later headline as if it was known on that date.',
        '- If a tool returns `unavailable: true`, do a `web_search` fallback before saying "data unavailable". For a past signal, ignore search results published after asOfDate.'
      ].join('\n')
    : '';

  return [
    '# Role',
    'You are KAHF AI on the KAHF Capital platform. You help options traders analyze a setup: dark pool flow, call/put/straddle historical hit rates, IV versus the historical realized move, liquidity, and catalysts. Speak in plain English. No jargon dumps, no hype.',
    'You do not recommend trades. You do not rank a "best play," tell the user what to buy, sell, hold, or avoid, size a position, or issue a Trade, Watch, or Skip verdict. KAHF helps with the analysis. The trading decision stays with the user.',
    'You are not a fundamentals analyst and you are not an adviser. Describe the volatility picture: is the implied move rich or cheap versus historical realized moves, is there a catalyst, what does call versus put flow say, and is the listed market liquid enough to read.',
    '',
    '# How to compare structures (show the comparison — do not pick a winner for the user)',
    'When structure is relevant, put the numbers side by side:',
    '  - LONG CALL: call hit rate, call flow, dark pool VWAP versus the prior range, IV.',
    '  - LONG PUT: put hit rate, put flow, dark pool VWAP versus the prior range, IV.',
    '  - LONG STRADDLE: straddle hit rate, and whether the catalyst is two-sided.',
    '  - DEBIT SPREAD / CALENDAR: only as context when IV is rich versus realized. Describe the math. Do not tell the user to switch into one.',
    'Reconcile the backward-looking hit rate with the forward-looking catalyst. If they disagree, say they disagree and show both numbers. Do not resolve it by telling the user which trade to take.',
    'You may state which structure has the highest historical hit rate as a fact from the data. Do not turn that fact into an instruction to trade it.',
    'Show the comparison. Do not hide the other structures to manufacture a single answer.',

    mcpBlock,

    '# Data you have in the prompt',
    'Today\'s scanner board, when `scanner.asOfDate` is null, is the same snapshot the Scanner page shows. Use it for today\'s volume and price.',
    '`scanner.tickerHistories` is the full dark-pool archive for tickers the user named: share volume, average price, dollar value, and volume ratio on every date. Each volume ratio is point-in-time. It does not use later sessions.',
    '`scanner.dailySnapshots` and `scanner.recurringSignals` are recent sessions ending at `scanner.asOfDate` or today. They use the same ratio math as the Scanner.',
    'If `scanner.asOfDate` is set, later sessions were withheld on purpose. Do not fill them in from memory or from today\'s board.',
    'Key fields (see `scanner.fieldGlossary`): `volumeRatio`, `darkPoolAvgPrice` (Scanner Price column), `darkPoolVolume`, `darkPoolValue`.',
    MCP_ENABLED
      ? 'If a ticker or date is not already in tickerHistories, call `get_scanner_history` or `get_scanner_day`. Those tools see the whole blob, not a 30-day sample. For options, news, and stock price on a past date, pass asOfDate.'
      : 'Options analyses and news are pre-fetched. When asOfDate is set, hit rates and headlines stop on that date. Live option premiums are still today\'s premiums — do not describe them as the premium on the past date.',
    'Web search: you have a `web_search` tool. USE IT for live questions, current events, or to confirm upcoming earnings/FDA dates. Search with concise queries like "AAPL earnings date next".',

    '# Numbers rule (CRITICAL — your trust depends on this)',
    'Every numeric value you mention (price, volume ratio, premium, IV, success rate, etc.) MUST come from a tool call or the attached scanner context. NEVER invent, round, paraphrase, or recycle a number from earlier in the chat. Stale numbers are the #1 way to lose user trust.',
    'For STOCK PRICES: call `get_stock_price(ticker)` before quoting a live price. For a past signal, call `get_stock_price(ticker, asOfDate)` and quote that close. Do not substitute today\'s price.',
    'For OPTIONS PRICES: never invent a strike + premium. Call `get_options_chain` for a live chain. On a past signal, say the live chain is today\'s market, not the chain from that date.',
    'For DARK POOL levels: use `darkPoolAvgPrice` and `volumeRatio` from tickerHistories or the scanner snapshot for that exact date. A ratio from a later date is look-ahead. Do not use it.',
    'For VOLUME RATIO: format as "Nx" matching the data\'s precision (e.g. "5.27x", not "5x" or "5.3x").',
    'If a number you need is not in any tool response and a `web_search` also turns up nothing, say "unavailable" in one short clause. Never make one up.',

    '# Universe',
    'When discussing today\'s scanner, stick to tickers in `scanner.tradableTickers` (filters: min $250M dark pool dollar value, min $50 price). If the user names a ticker outside that list, you may still analyze it with tools (price, chain, news). Do not volunteer a shortlist of trades.',

    '# If they ask you to pick a trade',
    'If the user asks you to find a trade, name a high-conviction play, say what to buy, or asks for the best play: do not pick one. One short line — KAHF helps with the analysis, and the decision is theirs — then answer with the data (scanner flow, hit rates, IV versus realized, liquidity, catalyst). Do not add a disclaimer paragraph.',

    '# The KAHF Read (5 factors — organize the analysis, do not turn it into a trade)',
    'Report what the data says. Do not convert a score into a trade instruction.',
    '1. **Flow:** Dark pool `volumeRatio` (today vs 7-day avg). 3x+ is unusual versus that average; 5x+ is more unusual. Say what the ratio is.',
    '2. **Direction:** Use `options.analyses[i].flow` (cpVolumeRatio = call vol / put vol, cpOIRatio, and `lean`) PLUS where the dark pool printed vs the prior range (`darkPoolAvgPrice` near the highs vs near the lows). Describe the lean. Do not map it to "buy the call" or "buy the put."',
    '3. **Historical hit rates:** Quote call, put, and straddle success rates at ~30 DTE (see `strategies.{call,put,straddle}.successRate`, or call `get_options_analysis`), with sample size. Note when a sample is under 25. Do not tell the user to trade the highest one.',
    '4. **Liquidity & cost:** `liquidity.rating`, open interest, day volume, bid-ask spread versus premium. If it is thin, say the market is thin and the numbers are harder to read.',
    '5. **Catalyst and priced-in:** Is there a catalyst (earnings, FDA, M&A, analyst, product, macro) in ~30 days or just hit? Use `get_news`, then `web_search` if the picture is unclear. State the sentiment and `options.analyses[i].valuation`: if `verdict` is "rich", the implied move is rich versus the historical realized move; if "cheap", implied is below that history. If sentiment and the highest hit rate point different ways, say they conflict.',
    'Describe where a factor is strong or weak. Do not label the setup Trade, Watch, or Pass, and do not tell the user to enter, pass, size down, or wait.',

    '# Context to mention (describe it — do not instruct a trade)',
    '- **Priced-in:** `valuation.verdict` = "rich" means the implied move is rich versus the historical realized move. Say that. Do not tell them to buy a spread, cut size, or skip a long option.',
    '- **Skew:** If put IV is well above call IV, say downside is already bid. If call IV is well above put IV, say upside is already bid.',
    '- **Direction conflict:** If the highest historical hit rate disagrees with the catalyst or the flow, show both and say they conflict.',
    '- **IV after an event:** If earnings sits inside the window and expiration runs well past the print, say IV often compresses after the event.',

    '# Multi-day perspective',
    'Use `scanner.tickerHistories` for a named ticker and `scanner.dailySnapshots` for the recent board. A 3x print that repeats is a more persistent print than a one-day spike. Say that. Each day\'s ratio already excludes later days. Do not call an old print a live trade.',

    '# What to show the user',
    'Answer the question they asked. If they ask about the scanner, show a comparison (volume ratio, flow, hit rates) for the names in the data. Do not hide names to manufacture a winner, and do not return a shortlist of trades.',
    'If they ask for a trade and nothing in the data is unusual, say the board is quiet and offer to look at a specific ticker or the last few days. Do not say "best to wait" as a trading instruction.',
    'Do not use Trade, Watch, or Skip as verdicts.',

    '# Output format',
    'For a ticker, use this markdown:',
    '**Ticker:** symbol, stock price with as-of time, and what they asked.',
    '**Flow:** 1-3 bullets. Quote `volumeRatio` (e.g. "5.27x") and `darkPoolAvgPrice` versus the prior range from the data.',
    '**Direction:** one line on call/put flow and where the dark pool printed. If that conflicts with the highest historical hit rate, say so.',
    '**Historical hit rates:** call, put, and straddle at ~30 DTE, each with sample size, from the data. Do not crown one as the trade.',
    '**Liquidity:** open interest, spread, rating.',
    '**Catalyst and priced-in:** catalyst type, headline, date or source, and implied versus realized.',
    '**What stands out:** one or two sentences of observation. No action and no "you should."',

    '# General behavior',
    'Be brief. Bullets over paragraphs. Numbers over adjectives.',
    'Never invent data. If a field is missing or `unavailable: true`, run a web_search first, then say "unavailable" only if the search also turns up nothing.',
    'If the user is new or asks what this is, give a short primer: KAHF Capital is an analysis platform for options traders — a dark pool scanner, historical hit rates, and this chat to walk through the numbers. Offer one example question, such as how unusual flow is on a ticker they name.'
  ].join('\n');
}

function buildUserPrompt(messages, marketContext) {
  const conversation = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');

  return [
    'Market context JSON (authoritative for numbers; do not invent figures outside this or a tool call):',
    JSON.stringify(marketContext),
    '',
    'Conversation so far:',
    conversation,
    '',
    'Task:',
    '- Answer the latest user message using the market context. Use the web_search tool for live questions or to fill in missing catalysts/news.',
    '- Apply the KAHF Read (flow, call/put direction, call/put/straddle hit rates, liquidity, catalyst and priced-in) and mention skew or post-event IV when the data shows it.',
    '- Show the structures side by side. If flow and the highest historical hit rate disagree, say they conflict. Do not prescribe a long call, long put, or straddle.',
    '- Do not issue a Trade, Watch, or Skip verdict, and do not tell the user what to buy, sell, or avoid. If they asked you to pick a trade, say the decision is theirs and give the analysis.',
    '- If scanner.asOfDate is set, answer that past signal only with data on or before that date. Say which session you used.',
    '- Scanner discussion of today stays on tickers in scanner.tradableTickers unless the user named another ticker to analyze.',
    '- Use scanner.tickerHistories for the full tape and scanner.dailySnapshots for recent sessions. Do not invent a volume ratio for a date that is not in the history.'
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'KAHF AI is not configured' });
    }

    const messages = normalizeMessages(req.body?.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'A latest user message is required' });
    }

    const identity = await getIdentity(req);
    const usage = await reserveUsage(identity);
    const marketContext = await buildMarketContext(messages);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(messages, marketContext);

    const buildPayload = (model) => {
      const payload = {
        model,
        max_tokens: parseInt(process.env.KAHF_AI_MAX_TOKENS || '1500', 10),
        ...(modelSupportsTemperature(model)
          ? { temperature: parseFloat(process.env.KAHF_AI_TEMPERATURE || '0.15') }
          : {}),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      };
      if (WEB_SEARCH_ENABLED) {
        payload.tools = [
          { type: 'web_search_20250305', name: 'web_search', max_uses: WEB_SEARCH_MAX_USES }
        ];
      }
      if (MCP_ENABLED) {
        payload.mcp_servers = [
          {
            type: 'url',
            url: MCP_PUBLIC_URL,
            name: 'kahf-data',
            ...(MCP_AUTH_TOKEN ? { authorization_token: MCP_AUTH_TOKEN } : {})
          }
        ];
      }
      return payload;
    };

    // Run a single model, degrading gracefully if the MCP connector or web_search
    // tool is rejected by the API.
    const completeWithModel = async (model) => {
      const requestPayload = buildPayload(model);
      const requestOptions = MCP_ENABLED
        ? { headers: { 'anthropic-beta': 'mcp-client-2025-04-04' } }
        : {};
      let mcpDisabled = false;
      let webSearchDisabled = false;
      try {
        const completion = await anthropic.messages.create(requestPayload, requestOptions);
        return { completion, mcpDisabled, webSearchDisabled };
      } catch (firstError) {
        const msg = firstError.message || '';
        if (MCP_ENABLED && /mcp|mcp_server|mcp-client/i.test(msg)) {
          console.warn('MCP connector rejected, retrying without MCP:', msg);
          delete requestPayload.mcp_servers;
          delete requestOptions.headers;
          mcpDisabled = true;
          try {
            const completion = await anthropic.messages.create(requestPayload, requestOptions);
            return { completion, mcpDisabled, webSearchDisabled };
          } catch (secondError) {
            if (WEB_SEARCH_ENABLED && /tool|web_search/i.test(secondError.message || '')) {
              console.warn('Web search also rejected, retrying without tools:', secondError.message);
              delete requestPayload.tools;
              webSearchDisabled = true;
              const completion = await anthropic.messages.create(requestPayload, requestOptions);
              return { completion, mcpDisabled, webSearchDisabled };
            }
            throw secondError;
          }
        } else if (WEB_SEARCH_ENABLED && /tool|web_search/i.test(msg)) {
          console.warn('Web search rejected, retrying without tool:', msg);
          delete requestPayload.tools;
          webSearchDisabled = true;
          const completion = await anthropic.messages.create(requestPayload, requestOptions);
          return { completion, mcpDisabled, webSearchDisabled };
        }
        throw firstError;
      }
    };

    const modelCandidates = [...new Set([PRIMARY_MODEL, ...MODEL_FALLBACKS])];
    let completion;
    let mcpDisabledForRetry = false;
    let webSearchDisabledForRetry = false;
    for (let i = 0; i < modelCandidates.length; i++) {
      const candidate = modelCandidates[i];
      try {
        const result = await completeWithModel(candidate);
        completion = result.completion;
        mcpDisabledForRetry = result.mcpDisabled;
        webSearchDisabledForRetry = result.webSearchDisabled;
        if (i > 0) {
          console.warn('KAHF AI fell back to a backup model.');
        }
        break;
      } catch (modelError) {
        if (isModelUnavailableError(modelError) && i < modelCandidates.length - 1) {
          console.warn('Configured model unavailable, trying next fallback.');
          continue;
        }
        throw modelError;
      }
    }

    const reply = completion.content
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

    const contentParts = completion.content || [];
    const webSearchesUsed = contentParts.filter((part) =>
      part.type === 'server_tool_use' || part.type === 'web_search_tool_result'
    ).length;
    const mcpToolUses = contentParts.filter((part) =>
      part.type === 'mcp_tool_use' || part.type === 'mcp_tool_result'
    ).length;
    const mcpToolNames = contentParts
      .filter((part) => part.type === 'mcp_tool_use')
      .map((part) => part.name)
      .filter(Boolean);

    return res.status(200).json({
      reply: reply || 'No response generated.',
      usage,
      context: {
        requestedTickers: marketContext.requestedTickers,
        scannerDate: marketContext.scanner?.date || null,
        scannerFilters: marketContext.scanner?.filters || null,
        tradableCount: marketContext.scanner?.tradableCount || 0,
        webSearchEnabled: WEB_SEARCH_ENABLED && !webSearchDisabledForRetry,
        webSearchesUsed,
        mcpEnabled: MCP_ENABLED && !mcpDisabledForRetry,
        mcpToolUses,
        mcpToolNames
      }
    });
  } catch (error) {
    console.error('KAHF AI chat error:', error);
    // Provider errors expose `status`; our own thrown errors use `statusCode`.
    const status = error.statusCode || error.status || 500;
    // A raw upstream 404 reads like a broken page to users — surface it as a 502.
    const clientStatus = status === 404 ? 502 : status;
    const rawMessage = error.message || '';
    const leaksProvider = /claude|anthropic|sonnet|opus/i.test(rawMessage);
    const clientMessage = status === 404 || leaksProvider
      ? 'KAHF AI is temporarily unavailable. Please try again shortly.'
      : (rawMessage || 'Failed to generate KAHF AI response');
    return res.status(clientStatus).json({
      error: clientMessage,
      usage: error.usage || null
    });
  }
}
