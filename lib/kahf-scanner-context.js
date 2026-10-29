import { getScannerSnapshot } from './scanner-snapshot';
import { getTickerHistory, getHistoryManifest, getRecentSignalBoards } from './scanner-history';
import { VOLUME_RATIO_METHOD } from './scanner-math';
import { summarizeTicker, passesScannerFilters } from './scanner-signals';

const MONTHS = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

export function extractSignalDate(messages) {
  const latestUser = [...(messages || [])].reverse().find((message) => message.role === 'user');
  const text = latestUser?.content || '';
  const iso = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/g);
  if (iso?.length) return validDate(iso[iso.length - 1]);
  const match = text.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b/i);
  if (!match) return null;
  const month = MONTHS[match[1].toLowerCase()];
  if (!month) return null;
  return validDate(`${match[3]}-${month}-${String(match[2]).padStart(2, '0')}`);
}

function validDate(iso) {
  const probe = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(probe.getTime())) return null;
  return probe.toISOString().slice(0, 10) === iso ? iso : null;
}

function toModelDay(row) {
  return {
    date: row.date,
    darkPoolVolume: row.total_volume,
    darkPoolAvgPrice: typeof row.avg_price === 'number' ? Number(row.avg_price.toFixed(2)) : null,
    darkPoolValue: row.total_value,
    darkPoolTradeCount: row.trade_count,
    avg7DayDarkPoolVolume: row.avg_7day_volume,
    volumeRatio: row.volume_ratio
  };
}

function recurringFromSessions(sessions) {
  const appearances = {};
  for (const session of sessions) {
    for (const row of session.topByVolumeRatio || []) {
      if (!appearances[row.ticker]) {
        appearances[row.ticker] = { ticker: row.ticker, daysInTop: 0, dates: [], maxRatio: 0 };
      }
      appearances[row.ticker].daysInTop += 1;
      appearances[row.ticker].dates.push(session.date);
      appearances[row.ticker].maxRatio = Math.max(appearances[row.ticker].maxRatio, row.volumeRatio || 0);
    }
  }
  return Object.values(appearances)
    .filter((entry) => entry.daysInTop >= 2)
    .sort((a, b) => b.daysInTop - a.daysInTop || b.maxRatio - a.maxRatio);
}

export async function buildAlignedScannerContext(requestedTickers, namedDate, options = {}) {
  const maxContextTickers = options.maxContextTickers || 12;
  const lookbackDays = options.lookbackDays || 8;
  const topPerDay = options.topPerDay || 5;
  const maxHistoryTickers = options.maxHistoryTickers || 4;
  const minVolume = options.minVolume;
  const minPrice = options.minPrice;
  const minRatio = options.minRatio;

  const snapshot = await getScannerSnapshot().catch((error) => {
    console.warn('[kahf-scanner] snapshot unavailable:', error.message);
    return null;
  });
  const manifest = await getHistoryManifest().catch((error) => {
    console.warn('[kahf-scanner] history manifest unavailable:', error.message);
    return null;
  });

  const latestDate = snapshot?.date || manifest?.latestDate || null;
  const asOf = namedDate && latestDate && namedDate < latestDate ? namedDate : null;
  const filters = {
    minVolumeUsd: minVolume,
    minPrice,
    minVolumeRatio: minRatio,
    description: `Tickers must show >= $${((minVolume || 0) / 1e6).toFixed(0)}M dark pool value and >= $${minPrice} avg price. Volume ratio gate is ${minRatio}x.`
  };

  let tradableTickers = [];
  let topSignals = [];
  if (!asOf && snapshot?.tickers?.length) {
    const summaries = snapshot.tickers.map((ticker) => summarizeTicker(ticker)).filter(passesScannerFilters);
    tradableTickers = summaries.map((ticker) => ticker.ticker).sort();
    topSignals = summaries
      .filter((ticker) => ticker.volumeRatio != null && ticker.volumeRatio >= minRatio)
      .sort((a, b) => b.volumeRatio - a.volumeRatio)
      .slice(0, maxContextTickers);
  }

  const historySymbols = [...new Set(requestedTickers || [])].slice(0, maxHistoryTickers);
  const tickerHistories = [];
  for (const symbol of historySymbols) {
    try {
      const history = await getTickerHistory(symbol, { asOf: asOf || undefined });
      const days = (history.days || []).map(toModelDay);
      tickerHistories.push({
        ticker: history.ticker,
        available: history.available,
        lookahead: false,
        asOf: history.asOf,
        firstDate: history.firstDate,
        lastDate: history.lastDate,
        dayCount: history.dayCount,
        daysWithheldAfterAsOf: history.daysWithheldAfterAsOf || 0,
        signalSession: days.length ? days[days.length - 1] : null,
        history: days,
        reason: history.reason
      });
    } catch (error) {
      tickerHistories.push({ ticker: symbol, available: false, lookahead: false, reason: error.message, history: [] });
    }
  }

  let dailySnapshots = [];
  try {
    const boards = await getRecentSignalBoards({
      asOf: asOf || latestDate,
      days: lookbackDays,
      minVolumeRatio: minRatio,
      limitPerDay: topPerDay
    });
    dailySnapshots = (boards.sessions || []).map((session) => ({
      date: session.date,
      isLatest: !asOf && session.date === latestDate,
      source: session.source,
      topByVolumeRatio: session.top || []
    }));
  } catch (error) {
    console.warn('[kahf-scanner] recent boards unavailable:', error.message);
  }

  const recurringSignals = recurringFromSessions(dailySnapshots).slice(0, maxContextTickers);

  return {
    available: Boolean(snapshot) || Boolean(manifest),
    lookahead: false,
    volumeRatioMethod: VOLUME_RATIO_METHOD,
    namedDate: namedDate || null,
    asOfDate: asOf,
    asOfRule: asOf
      ? `The user asked about ${namedDate}. Every dark-pool figure for that signal must come from tickerHistories or dailySnapshots, which stop on or before ${asOf}. ${tickerHistories.reduce((sum, item) => sum + (item.daysWithheldAfterAsOf || 0), 0)} later sessions were withheld. Do not use today's stock price, news after ${asOf}, or an options hit rate that includes later prices.`
      : 'No past signal date was named. Today\'s topSignals match the Scanner page. tickerHistories are the full archive, and each day\'s volumeRatio uses only data available on that day.',
    date: asOf || latestDate,
    sourceEndpoint: '/api/darkpool-trades (same data as the Scanner page)',
    filters,
    fieldGlossary: {
      darkPoolVolume: 'Share volume of dark pool prints on that date.',
      darkPoolValue: 'Dollar value of dark pool prints on that date.',
      darkPoolAvgPrice: 'Volume-weighted average dark pool price on that date. This is the Scanner page Price column.',
      volumeRatio: 'That date\'s darkPoolVolume divided by the trailing 7-calendar-day average, using only sessions on or before that date. Display as "5.27x".',
      avg7DayDarkPoolVolume: 'Rounded average dark pool volume inside that date\'s trailing window.',
      tickerHistories: 'Every archived session for the named tickers, through asOfDate when one was named. This is the full blob history, not a 30-day sample.',
      dailySnapshots: 'Top volume-ratio names on each recent session. Ratios are point-in-time for that session.'
    },
    archive: manifest
      ? {
          firstDate: manifest.firstDate,
          latestDate: manifest.latestDate,
          tradingDays: Array.isArray(manifest.dates) ? manifest.dates.length : 0,
          tickerCount: manifest.tickerCount || null,
          complete: true
        }
      : { complete: false, reason: 'History index is not built yet' },
    totalTickers: snapshot?.total_tickers || null,
    tradableCount: tradableTickers.length,
    tradableTickers,
    topSignals,
    dailySnapshots,
    recurringSignals,
    tickerHistories,
    requestedOffScanner: asOf
      ? []
      : (requestedTickers || []).filter((ticker) => tradableTickers.length > 0 && !tradableTickers.includes(ticker))
  };
}
