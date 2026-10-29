// Benzinga Calendar API → future-dated volatility events.
// A row is kept only when it has an exact calendar day inside the window.
// Publish time and fuzzy dates (for example "2026-Q1" or "2026") are dropped.

const API_BASE = 'https://api.benzinga.com/api/v2.1/calendar';
const PAGE_SIZE = 1000;
const CACHE_MS = 10 * 60 * 1000;
const EXACT_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_RE = /^[A-Z0-9][A-Z0-9.\-]{0,9}$/;

const cache = globalThis.__benzingaCalendarCache || (globalThis.__benzingaCalendarCache = new Map());
const inflight = globalThis.__benzingaCalendarInflight || (globalThis.__benzingaCalendarInflight = new Map());

export function marketToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(now);
}

export function addIsoDays(iso, days) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function inWindow(value, from, to) {
  return typeof value === 'string' && EXACT_DATE.test(value) && value >= from && value <= to;
}

function cleanTicker(value) {
  const ticker = String(value || '').trim().toUpperCase();
  return TICKER_RE.test(ticker) ? ticker : null;
}

function sessionFromTime(time) {
  if (!time || time === '00:00:00') return null;
  const [hour, minute] = String(time).split(':').map(Number);
  if (!Number.isFinite(hour)) return null;
  const minutes = hour * 60 + (Number.isFinite(minute) ? minute : 0);
  if (minutes < 9 * 60 + 30) return 'Before open';
  if (minutes >= 16 * 60) return 'After close';
  return 'During session';
}

function isConfirmed(value) {
  return value === 1 || value === true || value === '1' || value === 'true';
}

function formatDealSize(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(amount);
}

async function benzingaGet(path, { page = 0, query = {} } = {}) {
  const token = process.env.BENZINGA_API_KEY;
  if (!token) {
    const error = new Error('BENZINGA_API_KEY is not configured');
    error.code = 'NOT_CONFIGURED';
    throw error;
  }

  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set('token', token);
  url.searchParams.set('page', String(page));
  url.searchParams.set('pagesize', String(PAGE_SIZE));
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') url.searchParams.set(`parameters[${key}]`, String(value));
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  const apiError = Array.isArray(body?.errors) ? body.errors[0] : null;
  if (apiError?.code === 'no_data_found' || response.status === 404) return [];
  if (!response.ok || body?.ok === false || apiError) {
    const error = new Error(apiError?.value || `Benzinga ${path} failed (${response.status})`);
    error.status = apiError?.code === 'auth_failed' ? 401 : response.status;
    throw error;
  }

  if (Array.isArray(body)) return body;
  const list = body && typeof body === 'object'
    ? Object.values(body).find((value) => Array.isArray(value))
    : null;
  return list || [];
}

async function fetchPages(path, query, maxPages = 3) {
  const rows = [];
  for (let page = 0; page < maxPages; page += 1) {
    const batch = await benzingaGet(path, { page, query });
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

function earningsEvents(rows, from, to) {
  return rows.flatMap((row) => {
    const ticker = cleanTicker(row.ticker);
    if (!ticker || !inWindow(row.date, from, to)) return [];
    const period = [row.period, row.period_year].filter(Boolean).join(' ');
    return [{
      id: `earnings:${row.id || `${ticker}:${row.date}`}`,
      ticker,
      name: row.name || null,
      eventType: 'earnings',
      eventLabel: 'Earnings',
      eventDate: row.date,
      session: sessionFromTime(row.time),
      dateStatus: isConfirmed(row.date_confirmed) ? 'confirmed' : 'estimated',
      detail: period ? `${period} results` : 'Earnings report',
      importance: Number.isFinite(row.importance) ? row.importance : null,
      sourceUrl: null
    }];
  });
}

function fdaTickers(row) {
  const tickers = [];
  for (const company of row.companies || []) {
    for (const security of company.securities || []) {
      const ticker = cleanTicker(security.symbol);
      if (ticker) tickers.push({ ticker, name: company.name || null });
    }
  }
  const seen = new Set();
  return tickers.filter((item) => {
    if (seen.has(item.ticker)) return false;
    seen.add(item.ticker);
    return true;
  });
}

function fdaEvents(rows, from, to) {
  return rows.flatMap((row) => {
    const targetExact = EXACT_DATE.test(row.target_date || '');
    const announcedExact = EXACT_DATE.test(row.date || '');
    // This key usually leaves target_date blank and dates the row on the announcement.
    const eventDate = targetExact && inWindow(row.target_date, from, to)
      ? row.target_date
      : announcedExact && inWindow(row.date, from, to)
        ? row.date
        : null;
    if (!eventDate) return [];

    const drug = row.drug?.name;
    const indication = Array.isArray(row.drug?.indication_symptom) ? row.drug.indication_symptom[0] : null;
    const detail = [row.event_type, drug, indication].filter(Boolean).join(' · ') || 'FDA event';

    return fdaTickers(row).map(({ ticker, name }) => ({
      id: `fda:${row.id || eventDate}:${ticker}`,
      ticker,
      name,
      eventType: 'fda',
      eventLabel: 'FDA',
      eventDate,
      session: sessionFromTime(row.time),
      dateStatus: eventDate === row.target_date ? 'confirmed' : 'announced',
      detail,
      importance: null,
      sourceUrl: typeof row.source_link === 'string' && row.source_link.startsWith('http') ? row.source_link : null
    }));
  });
}

function maEvents(rows, from, to) {
  return rows.flatMap((row) => {
    if (/completed|terminated|withdrawn/i.test(row.deal_status || '')) return [];
    const closeExact = EXACT_DATE.test(row.date_expected || '') && inWindow(row.date_expected, from, to);
    const announced = EXACT_DATE.test(row.date || '') && inWindow(row.date, from, to);
    if (!closeExact && !announced) return [];

    const size = formatDealSize(row.deal_size);
    const expectedNote = !closeExact && row.date_expected ? `Expected ${row.date_expected}` : null;
    const parties = [
      [row.acquirer_ticker, row.acquirer_name, row.target_name ? `Acquiring ${row.target_name}` : 'Acquirer'],
      [row.target_ticker, row.target_name, row.acquirer_name ? `Acquisition by ${row.acquirer_name}` : 'Target']
    ];

    return parties.flatMap(([symbol, name, role]) => {
      const ticker = cleanTicker(symbol);
      if (!ticker) return [];
      return [{
        id: `ma:${row.id || row.date}:${ticker}`,
        ticker,
        name: name || null,
        eventType: 'ma',
        eventLabel: 'M&A',
        eventDate: closeExact ? row.date_expected : row.date,
        session: null,
        dateStatus: closeExact ? 'estimated' : 'announced',
        detail: [row.deal_type || 'Deal', role, row.deal_status, expectedNote, size].filter(Boolean).join(' · '),
        importance: Number.isFinite(row.importance) ? row.importance : null,
        sourceUrl: null
      }];
    });
  });
}

function splitEvents(rows, from, to) {
  return rows.flatMap((row) => {
    const ticker = cleanTicker(row.ticker);
    if (!ticker || !inWindow(row.date_ex, from, to)) return [];
    const ratio = row.ratio ? String(row.ratio).replace('-', ':') : null;
    return [{
      id: `split:${row.id || `${ticker}:${row.date_ex}`}`,
      ticker,
      name: row.name || null,
      eventType: 'split',
      eventLabel: 'Split',
      eventDate: row.date_ex,
      session: null,
      dateStatus: 'confirmed',
      detail: [row.split_type || 'Split', ratio, row.optionable ? 'Optionable' : null].filter(Boolean).join(' · '),
      importance: Number.isFinite(row.importance) ? row.importance : null,
      sourceUrl: null
    }];
  });
}

function dividendEvents(rows, from, to) {
  return rows.flatMap((row) => {
    const ticker = cleanTicker(row.ticker);
    if (!ticker || !inWindow(row.ex_dividend_date, from, to)) return [];
    const amount = Number(row.dividend);
    const amountLabel = Number.isFinite(amount) && amount > 0 ? `$${amount.toFixed(2)}` : null;
    const frequency = typeof row.frequency === 'string' && row.frequency ? row.frequency : null;
    return [{
      id: `dividend:${row.id || `${ticker}:${row.ex_dividend_date}`}`,
      ticker,
      name: row.name || null,
      eventType: 'dividend',
      eventLabel: 'Dividend',
      eventDate: row.ex_dividend_date,
      session: null,
      dateStatus: 'confirmed',
      detail: [row.dividend_type || 'Ex-dividend', amountLabel, frequency].filter(Boolean).join(' · '),
      importance: Number.isFinite(row.importance) ? row.importance : null,
      sourceUrl: null
    }];
  });
}

function macroFamily(name) {
  const text = String(name || '').toLowerCase();
  if (text.includes('cpi')) return 'CPI';
  if (text.includes('pce')) return 'PCE';
  if (text.includes('ppi')) return 'PPI';
  if (text.includes('nonfarm') || text.includes('payroll') || text.includes('hourly earnings') || text.includes('unemployment')) return 'Employment';
  if (text.includes('fomc') || text.includes('fed interest') || text.includes('fed monetary')) return 'FOMC';
  if (text.includes('retail sales')) return 'Retail sales';
  if (text.includes('gdp')) return 'GDP';
  if (text.includes('ism manufacturing')) return 'ISM manufacturing';
  if (text.includes('ism services')) return 'ISM services';
  if (text.includes('manufacturing pmi')) return 'Manufacturing PMI';
  if (text.includes('services pmi')) return 'Services PMI';
  return name || 'Macro';
}

function macroEvents(rows, from, to) {
  const grouped = new Map();
  for (const row of rows) {
    if (row.country !== 'USA' || !inWindow(row.date, from, to)) continue;
    if (!Number.isFinite(row.importance) || row.importance < 4) continue;
    const family = macroFamily(row.event_name);
    const key = `${row.date}:${family}`;
    if (!grouped.has(key)) {
      grouped.set(key, { date: row.date, family, names: [], importance: row.importance });
    }
    const item = grouped.get(key);
    if (row.event_name && !item.names.includes(row.event_name)) item.names.push(row.event_name);
    item.importance = Math.max(item.importance, row.importance);
  }

  return [...grouped.values()].map((item) => ({
    id: `macro:${item.date}:${item.family}`,
    ticker: 'US',
    name: item.family,
    eventType: 'macro',
    eventLabel: 'Macro',
    eventDate: item.date,
    session: null,
    dateStatus: 'confirmed',
    detail: item.names.length > 1 ? item.names.join(', ') : (item.names[0] || item.family),
    importance: item.importance,
    sourceUrl: null,
    linkTicker: false
  }));
}

function ipoEvents(rows, from, to) {
  return rows.flatMap((row) => {
    const ticker = cleanTicker(row.ticker);
    if (!ticker || !inWindow(row.date, from, to)) return [];
    if (/withdrawn|postponed/i.test(row.deal_status || '')) return [];
    const range = [row.price_min, row.price_max].filter(Boolean).join('–');
    return [{
      id: `ipo:${row.id || `${ticker}:${row.date}`}`,
      ticker,
      name: row.name || null,
      eventType: 'ipo',
      eventLabel: 'IPO',
      eventDate: row.date,
      session: sessionFromTime(row.time),
      dateStatus: row.open_date_verified ? 'confirmed' : 'estimated',
      detail: [row.ipo_type || 'IPO', row.deal_status, row.exchange, range ? `$${range}` : null].filter(Boolean).join(' · '),
      importance: null,
      sourceUrl: typeof row.sec_filing_url === 'string' && row.sec_filing_url.startsWith('http') ? row.sec_filing_url : null
    }];
  });
}

function dedupe(events) {
  const seen = new Set();
  const unique = [];
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    unique.push(event);
  }
  unique.sort((a, b) => (
    a.eventDate.localeCompare(b.eventDate)
    || a.ticker.localeCompare(b.ticker)
    || a.eventLabel.localeCompare(b.eventLabel)
  ));
  return unique;
}

async function loadSources(from, to) {
  const announcedFrom = addIsoDays(from, -540);
  const sources = [
    ['earnings', () => fetchPages('earnings', { date_from: from, date_to: to }), earningsEvents],
    ['fda', () => fetchPages('fda', { date_from: from, date_to: to, date_sort: 'announced' }), fdaEvents],
    ['ma', () => fetchPages('ma', { date_from: announcedFrom, date_to: to, date_sort: 'announced' }, 2), maEvents],
    ['splits', () => fetchPages('splits', { date_from: from, date_to: to, date_search_field: 'ex' }), splitEvents],
    ['ipos', () => fetchPages('ipos', { date_from: from, date_to: to }), ipoEvents],
    ['dividends', () => fetchPages('dividends', { date_from: from, date_to: to, date_search_field: 'ex' }), dividendEvents],
    ['economics', () => fetchPages('economics', { date_from: from, date_to: to, importance: 4 }, 2), macroEvents]
  ];

  const settled = await Promise.all(sources.map(async ([name, load, normalize]) => {
    try {
      const rows = await load();
      return { name, events: normalize(rows, from, to), error: null };
    } catch (error) {
      if (error.code === 'NOT_CONFIGURED' || error.status === 401 || error.status === 403) throw error;
      console.warn(`Benzinga ${name} calendar failed:`, error.message);
      return { name, events: [], error: error.message };
    }
  }));

  const failed = settled.filter((item) => item.error);
  const events = dedupe(settled.flatMap((item) => item.events));
  if (events.length === 0 && failed.length === settled.length) {
    throw new Error(failed[0].error || 'Benzinga calendar failed');
  }

  return {
    warnings: [...new Set(failed.map((item) => item.error))],
    events
  };
}

export async function getCatalystCalendar({ days = 30 } = {}) {
  const from = marketToday();
  const to = addIsoDays(from, Math.max(days - 1, 0));
  const cacheKey = `v2:${from}:${to}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const pending = inflight.get(cacheKey);
  if (pending) return pending;

  const job = loadSources(from, to)
    .then(({ events, warnings }) => {
      const value = {
        source: 'benzinga',
        from,
        to,
        days,
        asOf: new Date().toISOString(),
        count: events.length,
        warnings,
        events
      };
      cache.set(cacheKey, { expires: Date.now() + CACHE_MS, value });
      inflight.delete(cacheKey);
      return value;
    })
    .catch((error) => {
      inflight.delete(cacheKey);
      throw error;
    });

  inflight.set(cacheKey, job);
  return job;
}
