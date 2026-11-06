import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { buildAlignedScannerContext, extractSignalDate } from '../../lib/kahf-scanner-context';
import { getPublicTrackRecord } from '../../lib/track-record-public.js';
import { getCatalystCalendar } from '../../lib/benzinga-calendar.js';
import { verifyIdToken, isFirebaseAdminConfigured, getFirestoreAdmin, ensureProAccess } from '../../lib/firebase-admin';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getAllStrategyAnalyses } from '../../lib/options-analysis-service.js';
import { isProStatus } from '../../lib/subscription-access';
import { ANON_LIMIT, FREE_ACCOUNT_LIMIT, reserveUsage } from '../../lib/ai-usage';
import {
  POLYGON_API_BASE,
  SCANNER_MIN_VOLUME,
  SCANNER_MIN_PRICE,
  SIGNAL_MIN_VOLUME_RATIO,
  detectCatalysts
} from '../../lib/scanner-signals';

const MAX_CONTEXT_TICKERS = 12;
const MAX_STRADDLE_TICKERS = 5;
const MAX_RESEARCH_TICKERS = 5;
const SCANNER_LOOKBACK_DAYS = parseInt(process.env.KAHF_AI_LOOKBACK_DAYS || '8', 10);
const TOP_PER_DAY = 5;
const MAX_HISTORY_TICKERS_IN_PROMPT = 4;

const WEB_SEARCH_ENABLED = (process.env.KAHF_AI_WEB_SEARCH || 'true').toLowerCase() !== 'false';
const MODEL = 'claude-sonnet-5-5';
// The Messages API still requires a ceiling. This is Sonnet 5.5's output maximum.
const MAX_OUTPUT_TOKENS = 128000;

const MCP_PUBLIC_URL = process.env.MCP_PUBLIC_URL || (process.env.NEXT_PUBLIC_BASE_URL ? `${process.env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, '')}/api/mcp` : '');
const MCP_AUTH_TOKEN = process.env.MCP_AUTH_TOKEN || '';
const MCP_ENABLED = (process.env.KAHF_AI_MCP_ENABLED || 'true').toLowerCase() !== 'false' && Boolean(MCP_PUBLIC_URL);

function hashValue(value) {
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 48);
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

const NEWS_SCANNER_DAYS = 30;

function slimNewsEvent(event) {
  return {
    ticker: event.ticker,
    name: event.name || null,
    eventType: event.eventType,
    eventLabel: event.eventLabel,
    eventDate: event.eventDate,
    session: event.session || null,
    dateStatus: event.dateStatus || null,
    detail: event.detail || null,
    importance: event.importance ?? null
  };
}

async function loadNewsScannerContext() {
  try {
    const calendar = await getCatalystCalendar({ days: NEWS_SCANNER_DAYS });
    return {
      source: 'news-scanner',
      from: calendar.from,
      to: calendar.to,
      days: calendar.days,
      count: calendar.count,
      note: 'Same upcoming board as the News Scanner page: earnings, FDA, M&A, dividends, macro, splits, and IPOs that already have a calendar day. This is the live board, not a reconstruction of a past date.',
      events: (calendar.events || []).map(slimNewsEvent)
    };
  } catch (error) {
    console.warn('News scanner unavailable for KAHF AI:', error.message);
    return { unavailable: true, reason: error.message, events: [] };
  }
}

async function loadTrackRecordContext() {
  try {
    const record = await getPublicTrackRecord();
    return {
      summary: record.summary,
      holdingPeriodMeaning: 'Calendar days from the signal date to the exit. Calls and puts are held to expiration. Straddles exit at the first daily close beyond +40% or -30%. Open rows are still marked to market, so holdingDays runs through today.',
      rows: record.rows
    };
  } catch (error) {
    console.warn('Track record unavailable for KAHF AI:', error.message);
    return { unavailable: true, reason: error.message, rows: [] };
  }
}

async function buildMarketContext(messages) {
  const requestedTickers = extractTickers(messages);
  const namedDate = extractSignalDate(messages);
  const trackPromise = loadTrackRecordContext();
  const newsPromise = loadNewsScannerContext();
  const scanner = await buildScannerContext(requestedTickers, namedDate);
  const [trackRecord, newsScanner] = await Promise.all([trackPromise, newsPromise]);
  const asOfDate = scanner.asOfDate || null;
  const tradableSet = new Set(scanner.tradableTickers || []);

  if (MCP_ENABLED) {
    return {
      requestedTickers,
      asOfDate,
      scanner,
      trackRecord,
      newsScanner,
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
    trackRecord,
    newsScanner,
    options,
    straddle: options,
    research
  };
}

function buildSystemPrompt() {
  return [
    'You are KAHF AI. You may recommend trades. A recommendation has to match a KAHF signal in the data: the same ticker, the same structure, and the same signal date. Do not recommend a name or a structure that is not a signal.',
    'Short replies. Bullets. Do not invent data. Every number comes from the market context or a tool result.'
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
    'Answer the latest message. You may recommend a trade only when it matches a KAHF signal in this data. Short replies. Bullets. Do not invent data.'
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

    const buildPayload = () => {
      const payload = {
        model: MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      };
      if (WEB_SEARCH_ENABLED) {
        payload.tools = [
          { type: 'web_search_20250305', name: 'web_search' }
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
    const completeWithModel = async () => {
      const requestPayload = buildPayload();
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

    const result = await completeWithModel();
    const completion = result.completion;
    const mcpDisabledForRetry = result.mcpDisabled;
    const webSearchDisabledForRetry = result.webSearchDisabled;

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
