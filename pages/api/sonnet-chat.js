import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { listDataFiles, getDataFile } from '../../lib/blob-data';
import { verifyIdToken, isFirebaseAdminConfigured } from '../../lib/firebase-admin';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service.js';

const ANON_LIMIT = parseInt(process.env.KAHF_AI_ANON_MESSAGE_LIMIT || '1', 10);
const MAX_CONTEXT_TICKERS = 12;
const MAX_STRADDLE_TICKERS = 5;
const MAX_RESEARCH_TICKERS = 5;

const SCANNER_MIN_VOLUME = parseInt(process.env.KAHF_AI_SCANNER_MIN_VOLUME || '250000000', 10);
const SCANNER_MIN_PRICE = parseFloat(process.env.KAHF_AI_SCANNER_MIN_PRICE || '50');

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
  const ignored = new Set([
    'A', 'I', 'AI', 'API', 'ATM', 'DTE', 'ETF', 'IV', 'ME', 'MY', 'NO', 'OR',
    'ASK', 'BUY', 'CALL', 'CHAT', 'DARK', 'FOR', 'GET', 'NEWS', 'POOL', 'PRICE',
    'PRO', 'PUT', 'QUICK', 'RESEARCH', 'SELL', 'SETUP', 'SHOW', 'THE', 'TOP',
    'TRADE', 'USD', 'US', 'VOL', 'WHY', 'YOU'
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

  return {
    type: 'account',
    key: `uid:${verified.uid}`,
    uid: verified.uid,
    email: verified.email,
    tier: 'account',
    limit: null,
    isUnlimited: true,
    userData: null
  };
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

  const fallbackKey = `${period}:${identity.key}`;
  const currentCount = anonymousUsage.get(fallbackKey) || 0;
  if (currentCount >= limit) {
    const error = new Error('You used your free KAHF AI message. Sign in for unlimited access.');
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

function summarizeTicker(ticker, avg7DayVolume) {
  const ratio = avg7DayVolume > 0 ? Number((ticker.total_volume / avg7DayVolume).toFixed(2)) : null;
  return {
    ticker: ticker.ticker,
    totalVolume: ticker.total_volume,
    totalValue: ticker.total_value,
    avgPrice: ticker.avg_price,
    tradeCount: ticker.trade_count,
    avg7DayVolume,
    volumeRatio: ratio
  };
}

function passesScannerFilters(summary) {
  return (
    typeof summary.totalValue === 'number' &&
    summary.totalValue >= SCANNER_MIN_VOLUME &&
    typeof summary.avgPrice === 'number' &&
    summary.avgPrice >= SCANNER_MIN_PRICE
  );
}

async function getPriorRange(ticker, scannerDate) {
  if (!process.env.POLYGON_API_KEY) return null;

  try {
    const endDate = scannerDate || new Date().toISOString().split('T')[0];
    const startDate = new Date(new Date(`${endDate}T12:00:00`).getTime() - 14 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const history = await getHistoricalStockData(ticker, startDate, endDate);
    const prior = [...history].reverse().find((day) => day.date < endDate);
    if (!prior) return null;
    return {
      date: prior.date,
      high: prior.high,
      low: prior.low,
      close: prior.close
    };
  } catch (error) {
    console.warn(`Prior range unavailable for ${ticker}:`, error.message);
    return null;
  }
}

async function buildScannerContext(requestedTickers) {
  const files = await listDataFiles();
  if (files.length === 0) {
    return { available: false, reason: 'No scanner files found', tradableTickers: [], filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE } };
  }

  const latestFile = files[0];
  const latestData = await getDataFile(latestFile.url);
  if (!latestData?.tickers?.length) {
    return { available: false, reason: 'Latest scanner file has no tickers', tradableTickers: [], filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE } };
  }

  const recentFiles = files.slice(0, 20);
  const averageFiles = files.slice(0, 7);
  const volumeTotals = {};
  const volumeCounts = {};
  const requestedSet = new Set(requestedTickers);
  const historyByTicker = {};

  for (const file of recentFiles) {
    try {
      const data = file.url === latestFile.url ? latestData : await getDataFile(file.url);
      if (!data?.tickers) continue;
      for (const ticker of data.tickers) {
        if (averageFiles.some((averageFile) => averageFile.filename === file.filename)) {
          volumeTotals[ticker.ticker] = (volumeTotals[ticker.ticker] || 0) + ticker.total_volume;
          volumeCounts[ticker.ticker] = (volumeCounts[ticker.ticker] || 0) + 1;
        }

        if (requestedSet.has(ticker.ticker)) {
          if (!historyByTicker[ticker.ticker]) historyByTicker[ticker.ticker] = [];
          historyByTicker[ticker.ticker].push({
            date: file.filename.replace('.json', ''),
            totalVolume: ticker.total_volume,
            avgPrice: ticker.avg_price,
            totalValue: ticker.total_value,
            tradeCount: ticker.trade_count
          });
        }
      }
    } catch (error) {
      console.warn(`Skipping scanner context file ${file.filename}:`, error.message);
    }
  }

  const averageFor = (ticker) => {
    const count = volumeCounts[ticker] || 0;
    return count > 0 ? Math.round((volumeTotals[ticker] || 0) / count) : 0;
  };

  const allSummaries = latestData.tickers.map((ticker) => summarizeTicker(ticker, averageFor(ticker.ticker)));
  const tradableSummaries = allSummaries.filter(passesScannerFilters);

  const topSignals = tradableSummaries
    .filter((ticker) => ticker.volumeRatio !== null)
    .sort((a, b) => b.volumeRatio - a.volumeRatio)
    .slice(0, MAX_CONTEXT_TICKERS);

  const tradableTickerSet = new Set(tradableSummaries.map((ticker) => ticker.ticker));

  const selectedSymbols = [
    ...new Set([
      ...requestedTickers.filter((ticker) => tradableTickerSet.has(ticker)),
      ...topSignals.map((ticker) => ticker.ticker)
    ])
  ].slice(0, MAX_CONTEXT_TICKERS);

  const selectedSignals = await Promise.all(selectedSymbols.map(async (symbol) => {
    const latest = tradableSummaries.find((ticker) => ticker.ticker === symbol);
    if (!latest) return null;
    const priorRange = await getPriorRange(symbol, latestFile.filename.replace('.json', ''));
    return {
      ...latest,
      priorRange,
      avgPriceVsPriorRange: priorRange
        ? latest.avgPrice > priorRange.high
          ? 'above prior range'
          : latest.avgPrice < priorRange.low
            ? 'below prior range'
            : 'inside prior range'
        : 'unavailable'
    };
  }));

  const requestedOffScanner = requestedTickers.filter((ticker) => !tradableTickerSet.has(ticker));

  return {
    available: true,
    date: latestFile.filename.replace('.json', ''),
    filters: {
      minVolumeUsd: SCANNER_MIN_VOLUME,
      minPrice: SCANNER_MIN_PRICE,
      description: `Tickers must show >= $${(SCANNER_MIN_VOLUME / 1e6).toFixed(0)}M dark pool value and >= $${SCANNER_MIN_PRICE} avg price.`
    },
    totalTickers: latestData.total_tickers || latestData.tickers.length,
    tradableCount: tradableTickerSet.size,
    totalVolume: latestData.total_volume,
    tradableTickers: [...tradableTickerSet].sort(),
    topSignals,
    selectedSignals: selectedSignals.filter(Boolean),
    requestedHistory: historyByTicker,
    requestedOffScanner
  };
}

async function buildStraddleContext(tickers) {
  if (!process.env.POLYGON_API_KEY || tickers.length === 0) {
    return {
      available: false,
      reason: process.env.POLYGON_API_KEY ? 'No tickers requested' : 'Polygon API key not configured'
    };
  }

  const analyses = await Promise.all(tickers.slice(0, MAX_STRADDLE_TICKERS).map(async (ticker) => {
    const analysis = await getStraddleSuccessRate(ticker);
    return analysis ? { ticker, ...analysis } : { ticker, unavailable: true };
  }));

  return {
    available: true,
    analyses
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'KAHF-Capital-AI/1.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Research request failed: ${response.status}`);
  }

  return response.json();
}

async function getYahooResearch(ticker) {
  try {
    const data = await fetchJson(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=1&newsCount=5`
    );

    return {
      ticker,
      quotes: (data.quotes || []).slice(0, 2).map((quote) => ({
        symbol: quote.symbol,
        shortname: quote.shortname,
        exchange: quote.exchange,
        quoteType: quote.quoteType
      })),
      news: (data.news || []).slice(0, 5).map((item) => ({
        title: item.title,
        publisher: item.publisher,
        link: item.link,
        publishTime: item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : null
      }))
    };
  } catch (error) {
    console.warn(`Yahoo research unavailable for ${ticker}:`, error.message);
    return {
      ticker,
      unavailable: true,
      reason: error.message
    };
  }
}

async function getPriceResearch(ticker) {
  try {
    if (!process.env.POLYGON_API_KEY) {
      return { ticker, unavailable: true, reason: 'Polygon API key not configured' };
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

async function buildResearchContext(messages, tickers) {
  const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user')?.content || '';
  const researchTickers = tickers.slice(0, MAX_RESEARCH_TICKERS);
  const [prices, financeNews] = await Promise.all([
    Promise.all(researchTickers.map(getPriceResearch)),
    Promise.all(researchTickers.map(getYahooResearch))
  ]);

  return {
    enabled: true,
    scope: 'Use website data plus public web research for news, qualitative context, and price checks.',
    latestQuery: latestUserMessage,
    prices,
    financeNews
  };
}

async function buildMarketContext(messages) {
  const requestedTickers = extractTickers(messages);
  const scanner = await buildScannerContext(requestedTickers);
  const tradableSet = new Set(scanner.tradableTickers || []);

  const tickersForStraddle = (
    requestedTickers.filter((ticker) => tradableSet.has(ticker)).length > 0
      ? requestedTickers.filter((ticker) => tradableSet.has(ticker))
      : scanner.topSignals?.slice(0, MAX_STRADDLE_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const tickersForResearch = (
    requestedTickers.length > 0
      ? requestedTickers
      : scanner.topSignals?.slice(0, MAX_RESEARCH_TICKERS).map((ticker) => ticker.ticker) || []
  );

  const straddle = await buildStraddleContext(tickersForStraddle);
  const research = await buildResearchContext(messages, tickersForResearch);

  return {
    requestedTickers,
    scanner,
    straddle,
    research
  };
}

function buildSystemPrompt() {
  return [
    'You are KAHF AI, a concise volatility-trading assistant for KAHF Capital.',
    'Style: brief, straight-to-the-point, bullets over paragraphs, no filler.',
    'Data sources you may use: scanner data and history, straddle analysis, price research, and public web research provided in context.',
    'Recommendation universe rule: only suggest, recommend, or rank tickers that appear in `scanner.tradableTickers`. Never invent or recommend tickers outside that list.',
    'If the user mentions a ticker not in `scanner.tradableTickers`, briefly note it is not on today\'s scanner (filters: min $250M dark pool value, min $50 price) and decline to issue a trade recommendation, but you may share neutral context such as price or news.',
    'When giving a trade recommendation, output three short labeled sections: "Dark pool factors", "Quantitative factors", "Qualitative factors". Use 1-3 tight bullets per section, only including factors that actually influenced the call.',
    'Dark pool emphasis: cite volume ratio (today vs 7-day avg) and whether the average dark pool price is above, inside, or below the prior day high/low range.',
    'Quantitative emphasis: cite straddle success rate, days to expiration, premium, and any clear historical edge.',
    'Qualitative emphasis: cite recent news titles or themes when available; if no relevant qualitative context is provided, state that briefly instead of inventing news.',
    'Never fabricate data. If a field is missing or marked unavailable, say so in one short clause.',
    'End every recommendation with a one-line risk note: this is research, not financial advice.'
  ].join(' ');
}

function buildUserPrompt(messages, marketContext) {
  const conversation = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');

  return [
    'Market context JSON (authoritative; ignore anything outside this for trade recommendations):',
    JSON.stringify(marketContext),
    '',
    'Conversation so far:',
    conversation,
    '',
    'Task:',
    '- Answer the latest user message using the market context.',
    '- Keep it brief.',
    '- Trade recommendations must be limited to tickers in scanner.tradableTickers.',
    '- If recommending a trade, include the three labeled sections (Dark pool factors, Quantitative factors, Qualitative factors).'
  ].join('\n');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Anthropic API key not configured' });
    }

    const messages = normalizeMessages(req.body?.messages);
    if (messages.length === 0 || messages[messages.length - 1].role !== 'user') {
      return res.status(400).json({ error: 'A latest user message is required' });
    }

    const identity = await getIdentity(req);
    const usage = await reserveUsage(identity);
    const marketContext = await buildMarketContext(messages);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const completion = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: parseInt(process.env.KAHF_AI_MAX_TOKENS || process.env.SONNET_MAX_TOKENS || '1200', 10),
      temperature: parseFloat(process.env.KAHF_AI_TEMPERATURE || '0.15'),
      system: buildSystemPrompt(),
      messages: [
        {
          role: 'user',
          content: buildUserPrompt(messages, marketContext)
        }
      ]
    });

    const reply = completion.content
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text)
      .join('\n')
      .trim();

    return res.status(200).json({
      reply: reply || 'No response generated.',
      usage,
      context: {
        requestedTickers: marketContext.requestedTickers,
        scannerDate: marketContext.scanner?.date || null,
        scannerFilters: marketContext.scanner?.filters || null,
        tradableCount: marketContext.scanner?.tradableCount || 0
      }
    });
  } catch (error) {
    console.error('KAHF AI chat error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.message || 'Failed to generate KAHF AI response',
      usage: error.usage || null
    });
  }
}
