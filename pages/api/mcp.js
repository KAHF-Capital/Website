/**
 * KAHF Data MCP Server
 *
 * Implements the Model Context Protocol over HTTP (JSON-RPC) so Anthropic
 * Claude (or any MCP client) can call KAHF data tools on demand.
 *
 * Transport: Streamable HTTP, JSON responses (no SSE required for stateless tools).
 * Auth: Bearer token via Authorization header. Set MCP_AUTH_TOKEN env var.
 *
 * Anthropic Messages API wires this in via:
 *   mcp_servers: [{
 *     type: 'url',
 *     url: 'https://yourdomain/api/mcp',
 *     name: 'kahf-data',
 *     authorization_token: process.env.MCP_AUTH_TOKEN
 *   }]
 * with header: 'anthropic-beta: mcp-client-2025-04-04'
 */

import { listDataFiles, getDataFile } from '../../lib/blob-data';
import { getCurrentStockPrice, getHistoricalStockData } from '../../lib/polygon-data-service.js';
import { getStraddleSuccessRate } from '../../lib/straddle-analysis-service.js';

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_NAME = 'kahf-data';
const SERVER_VERSION = '1.0.0';

const SCANNER_MIN_VOLUME = parseInt(process.env.KAHF_AI_SCANNER_MIN_VOLUME || '250000000', 10);
const SCANNER_MIN_PRICE = parseFloat(process.env.KAHF_AI_SCANNER_MIN_PRICE || '50');
const SIGNAL_MIN_VOLUME_RATIO = parseFloat(process.env.KAHF_AI_MIN_VOLUME_RATIO || '2.0');

const POLYGON_API_BASE = 'https://api.massive.com';
const CATALYST_KEYWORDS = [
  { kind: 'earnings', words: ['earnings', 'q1 results', 'q2 results', 'q3 results', 'q4 results', 'eps', 'guidance', 'pre-announce', 'preliminary results'] },
  { kind: 'fda', words: ['fda', 'phase 1', 'phase 2', 'phase 3', 'clinical trial', 'approval', 'pdufa', 'breakthrough designation'] },
  { kind: 'm&a', words: ['acquire', 'acquisition', 'merger', 'buyout', 'takeover', 'tender offer'] },
  { kind: 'analyst', words: ['upgrade', 'downgrade', 'price target', 'initiates coverage', 'reiterates'] },
  { kind: 'product', words: ['launch', 'unveil', 'announces partnership', 'contract win', 'patent'] },
  { kind: 'capital', words: ['buyback', 'share repurchase', 'dividend', 'secondary offering', 'spin-off', 'split'] },
  { kind: 'macro', words: ['cpi', 'fomc', 'fed minutes', 'jobs report', 'payrolls'] },
  { kind: 'legal', words: ['lawsuit', 'settlement', 'investigation', 'doj', 'sec charges'] }
];

function detectCatalysts(text) {
  if (!text) return [];
  const lowered = text.toLowerCase();
  const hits = new Set();
  for (const group of CATALYST_KEYWORDS) {
    if (group.words.some((word) => lowered.includes(word))) hits.add(group.kind);
  }
  return [...hits];
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

// -------------- Tool implementations --------------

async function loadScannerWindow(days) {
  const files = await listDataFiles();
  if (files.length === 0) return { files: [], windowFiles: [], data: {} };
  const windowFiles = files.slice(0, Math.max(1, Math.min(days, 30)));
  const averageFiles = files.slice(0, 7);
  const data = {};
  for (const file of windowFiles) {
    try {
      data[file.filename] = await getDataFile(file.url);
    } catch (error) {
      console.warn(`MCP: skipping scanner file ${file.filename}:`, error.message);
    }
  }
  return { files, windowFiles, averageFiles, data };
}

function compute7DayAvg(averageFiles, dataMap) {
  const totals = {};
  const counts = {};
  for (const file of averageFiles) {
    const day = dataMap[file.filename];
    if (!day?.tickers) continue;
    for (const ticker of day.tickers) {
      totals[ticker.ticker] = (totals[ticker.ticker] || 0) + ticker.total_volume;
      counts[ticker.ticker] = (counts[ticker.ticker] || 0) + 1;
    }
  }
  return (sym) => {
    const c = counts[sym] || 0;
    return c > 0 ? Math.round((totals[sym] || 0) / c) : 0;
  };
}

async function tool_get_scanner_signals({ minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO, limit = 10 } = {}) {
  const { windowFiles, averageFiles, data } = await loadScannerWindow(7);
  if (windowFiles.length === 0) return { available: false, reason: 'No scanner files' };
  const latest = windowFiles[0];
  const latestData = data[latest.filename];
  if (!latestData?.tickers) return { available: false, reason: 'Latest scanner empty' };
  const avgFor = compute7DayAvg(averageFiles, data);
  const signals = latestData.tickers
    .map((t) => summarizeTicker(t, avgFor(t.ticker)))
    .filter(passesScannerFilters)
    .filter((s) => s.volumeRatio !== null && s.volumeRatio >= minVolumeRatio)
    .sort((a, b) => b.volumeRatio - a.volumeRatio)
    .slice(0, Math.max(1, Math.min(limit, 25)));
  return {
    available: true,
    date: latest.filename.replace('.json', ''),
    filters: { minVolumeUsd: SCANNER_MIN_VOLUME, minPrice: SCANNER_MIN_PRICE, minVolumeRatio },
    signals
  };
}

async function tool_get_recurring_signals({ minDaysInTop = 2, lookbackDays = 5, minVolumeRatio = SIGNAL_MIN_VOLUME_RATIO } = {}) {
  const { windowFiles, averageFiles, data } = await loadScannerWindow(Math.max(lookbackDays, 5));
  if (windowFiles.length === 0) return { available: false, reason: 'No scanner files' };
  const avgFor = compute7DayAvg(averageFiles, data);
  const appearances = {};
  for (let i = 0; i < Math.min(windowFiles.length, lookbackDays); i++) {
    const file = windowFiles[i];
    const day = data[file.filename];
    if (!day?.tickers) continue;
    const date = file.filename.replace('.json', '');
    const top = day.tickers
      .map((t) => summarizeTicker(t, avgFor(t.ticker)))
      .filter(passesScannerFilters)
      .filter((s) => s.volumeRatio !== null && s.volumeRatio >= minVolumeRatio)
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, 5);
    for (const s of top) {
      if (!appearances[s.ticker]) appearances[s.ticker] = { ticker: s.ticker, daysInTop: 0, dates: [], maxRatio: 0 };
      appearances[s.ticker].daysInTop += 1;
      appearances[s.ticker].dates.push(date);
      appearances[s.ticker].maxRatio = Math.max(appearances[s.ticker].maxRatio, s.volumeRatio);
    }
  }
  const recurring = Object.values(appearances)
    .filter((e) => e.daysInTop >= minDaysInTop)
    .sort((a, b) => b.daysInTop - a.daysInTop || b.maxRatio - a.maxRatio);
  return { available: true, lookbackDays, minDaysInTop, recurring };
}

async function tool_get_scanner_history({ ticker, days = 14 } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  const { windowFiles, data } = await loadScannerWindow(Math.max(days, 1));
  const history = [];
  for (const file of windowFiles) {
    const day = data[file.filename];
    if (!day?.tickers) continue;
    const match = day.tickers.find((t) => t.ticker === sym);
    if (match) {
      history.push({
        date: file.filename.replace('.json', ''),
        totalVolume: match.total_volume,
        totalValue: match.total_value,
        avgPrice: match.avg_price,
        tradeCount: match.trade_count
      });
    }
  }
  return { ticker: sym, days, history };
}

async function tool_get_prior_range({ ticker, asOfDate } = {}) {
  if (!ticker) throw new Error('ticker is required');
  if (!process.env.POLYGON_API_KEY) return { ticker, unavailable: true, reason: 'Polygon API key not configured' };
  const sym = ticker.toUpperCase();
  const endDate = asOfDate || new Date().toISOString().split('T')[0];
  const startDate = new Date(new Date(`${endDate}T12:00:00`).getTime() - 14 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];
  try {
    const hist = await getHistoricalStockData(sym, startDate, endDate);
    const prior = [...hist].reverse().find((d) => d.date < endDate);
    if (!prior) return { ticker: sym, unavailable: true, reason: 'No prior day data' };
    return { ticker: sym, asOfDate: endDate, priorDay: prior };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_straddle_analysis({ ticker } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  const result = await getStraddleSuccessRate(sym);
  if (!result) return { ticker: sym, unavailable: true, reason: 'Straddle data unavailable' };
  return { ticker: sym, ...result };
}

async function tool_get_stock_price({ ticker } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const price = await getCurrentStockPrice(sym);
    return { ticker: sym, price, source: 'polygon prev close' };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

async function tool_get_news({ ticker, limit = 5 } = {}) {
  if (!ticker) throw new Error('ticker is required');
  const sym = ticker.toUpperCase();
  if (!process.env.POLYGON_API_KEY) return { ticker: sym, unavailable: true, reason: 'Polygon API key not configured' };
  try {
    const url = `${POLYGON_API_BASE}/v2/reference/news?ticker=${encodeURIComponent(sym)}&limit=${Math.min(limit, 10)}&order=desc&sort=published_utc&apiKey=${process.env.POLYGON_API_KEY}`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Polygon news ${res.status}`);
    const data = await res.json();
    const news = (data.results || []).slice(0, limit).map((item) => {
      const text = `${item.title || ''} ${item.description || ''}`;
      return {
        title: item.title,
        publisher: item.publisher?.name || item.author || null,
        publishedAt: item.published_utc || null,
        url: item.article_url || null,
        catalysts: detectCatalysts(text),
        keywords: Array.isArray(item.keywords) ? item.keywords.slice(0, 6) : []
      };
    });
    return { ticker: sym, news, catalysts: [...new Set(news.flatMap((n) => n.catalysts))] };
  } catch (e) {
    return { ticker: sym, unavailable: true, reason: e.message };
  }
}

// -------------- Tool registry --------------

const TOOLS = [
  {
    name: 'get_scanner_signals',
    description:
      'Return today\'s scanner signals (tradable tickers with volume ratio above the threshold), sorted by volume ratio. Use this to find the freshest dark-pool unusual-volume candidates.',
    inputSchema: {
      type: 'object',
      properties: {
        minVolumeRatio: { type: 'number', description: 'Minimum volume ratio (today vs 7-day avg). Default 2.0.', default: 2.0 },
        limit: { type: 'integer', description: 'Max signals to return (1-25).', default: 10 }
      }
    },
    handler: tool_get_scanner_signals
  },
  {
    name: 'get_recurring_signals',
    description:
      'Return tickers that appeared in the daily scanner top list multiple days within the lookback window. Use this to identify sustained dark-pool interest, not just one-day spikes.',
    inputSchema: {
      type: 'object',
      properties: {
        minDaysInTop: { type: 'integer', description: 'Min number of days a ticker must be in the top list. Default 2.', default: 2 },
        lookbackDays: { type: 'integer', description: 'How many days back to look. Default 5.', default: 5 },
        minVolumeRatio: { type: 'number', description: 'Minimum volume ratio per day. Default 2.0.', default: 2.0 }
      }
    },
    handler: tool_get_recurring_signals
  },
  {
    name: 'get_scanner_history',
    description:
      'Return the dark-pool scanner history (per day) for a single ticker over the requested window. Use this to inspect trend (volume building / fading) and average price drift.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. AAPL).' },
        days: { type: 'integer', description: 'Lookback days. Default 14, max 30.', default: 14 }
      }
    },
    handler: tool_get_scanner_history
  },
  {
    name: 'get_prior_range',
    description:
      'Return the prior trading day high/low/close for a ticker. Use this to determine whether the current dark-pool average price is above, inside, or below the prior range.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        asOfDate: { type: 'string', description: 'YYYY-MM-DD. Defaults to today.' }
      }
    },
    handler: tool_get_prior_range
  },
  {
    name: 'get_straddle_analysis',
    description:
      'Return the 30-day ATM straddle analysis for a ticker: success rate, premium, DTE, sample size, options liquidity (volume/OI/spread), and IV. Use this to score the quantitative + liquidity criteria.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: { ticker: { type: 'string' } }
    },
    handler: tool_get_straddle_analysis
  },
  {
    name: 'get_stock_price',
    description: 'Return the most recent close price for a ticker via Polygon.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: { ticker: { type: 'string' } }
    },
    handler: tool_get_stock_price
  },
  {
    name: 'get_news',
    description:
      'Return recent news headlines for a ticker, each tagged with detected catalyst categories (earnings, fda, m&a, analyst, product, capital, macro, legal). Use this to find qualitative catalysts.',
    inputSchema: {
      type: 'object',
      required: ['ticker'],
      properties: {
        ticker: { type: 'string' },
        limit: { type: 'integer', description: 'Max headlines (1-10). Default 5.', default: 5 }
      }
    },
    handler: tool_get_news
  }
];

// -------------- JSON-RPC handlers --------------

function rpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id, code, message, data = undefined) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: '2.0', id, error: err };
}

async function handleRpc(message) {
  const { id = null, method, params = {} } = message || {};

  if (method === 'initialize') {
    return rpcResult(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: { name: SERVER_NAME, version: SERVER_VERSION }
    });
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return null;
  }

  if (method === 'ping') {
    return rpcResult(id, {});
  }

  if (method === 'tools/list') {
    return rpcResult(id, {
      tools: TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema
      }))
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params;
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return rpcError(id, -32601, `Unknown tool: ${name}`);
    try {
      const data = await tool.handler(args);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(data) }],
        isError: false
      });
    } catch (error) {
      console.error(`MCP tool ${name} failed:`, error);
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify({ error: error.message }) }],
        isError: true
      });
    }
  }

  return rpcError(id, -32601, `Method not found: ${method}`);
}

// -------------- HTTP transport --------------

function isAuthorized(req) {
  const expected = process.env.MCP_AUTH_TOKEN;
  if (!expected) return true; // dev mode: no auth required
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return false;
  return header.slice(7) === expected;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, mcp-session-id, mcp-protocol-version');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      name: SERVER_NAME,
      version: SERVER_VERSION,
      protocol: PROTOCOL_VERSION,
      transport: 'http-jsonrpc',
      tools: TOOLS.map((t) => t.name)
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized: missing or invalid Bearer token' });
  }

  const body = req.body;
  if (!body) return res.status(400).json({ error: 'Empty body' });

  try {
    if (Array.isArray(body)) {
      const responses = [];
      for (const msg of body) {
        const out = await handleRpc(msg);
        if (out) responses.push(out);
      }
      return res.status(200).json(responses);
    }

    const out = await handleRpc(body);
    if (out === null) {
      return res.status(202).end();
    }
    return res.status(200).json(out);
  } catch (error) {
    console.error('MCP handler error:', error);
    return res.status(500).json(rpcError(body?.id || null, -32603, error.message));
  }
}
