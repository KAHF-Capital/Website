// Scanner thresholds and per-ticker helpers shared by KAHF AI
// (/api/kahf-ai-chat), the kahf-data MCP server (/api/mcp) and the home preview.

export const POLYGON_API_BASE = 'https://api.massive.com';

export const SCANNER_MIN_VOLUME = parseInt(process.env.KAHF_AI_SCANNER_MIN_VOLUME || '250000000', 10);
export const SCANNER_MIN_PRICE = parseFloat(process.env.KAHF_AI_SCANNER_MIN_PRICE || '50');
export const SIGNAL_MIN_VOLUME_RATIO = parseFloat(process.env.KAHF_AI_MIN_VOLUME_RATIO || '2.0');

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

export function detectCatalysts(text) {
  if (!text) return [];
  const lowered = text.toLowerCase();
  return CATALYST_KEYWORDS
    .filter((group) => group.words.some((word) => lowered.includes(word)))
    .map((group) => group.kind);
}

export function summarizeTicker(ticker, avg7DayVolume) {
  // Prefer the ratio precomputed by lib/scanner-snapshot so numbers match the
  // Scanner UI exactly; fall back to computing from the supplied average.
  const precomputedRatio = typeof ticker.volume_ratio === 'number' && Number.isFinite(ticker.volume_ratio)
    ? ticker.volume_ratio
    : null;
  const precomputedAvg = typeof ticker.avg_7day_volume === 'number' && ticker.avg_7day_volume > 0
    ? ticker.avg_7day_volume
    : null;

  const avgForRatio = precomputedAvg ?? avg7DayVolume;
  const ratio = precomputedRatio !== null
    ? precomputedRatio
    : avgForRatio > 0
      ? Number((ticker.total_volume / avgForRatio).toFixed(2))
      : null;
  return {
    ticker: ticker.ticker,
    darkPoolVolume: ticker.total_volume,
    darkPoolValue: ticker.total_value,
    darkPoolAvgPrice: typeof ticker.avg_price === 'number' ? Number(ticker.avg_price.toFixed(2)) : null,
    darkPoolTradeCount: ticker.trade_count,
    avg7DayDarkPoolVolume: avgForRatio,
    volumeRatio: ratio
  };
}

export function passesScannerFilters(summary) {
  return (
    typeof summary.darkPoolValue === 'number' &&
    summary.darkPoolValue >= SCANNER_MIN_VOLUME &&
    typeof summary.darkPoolAvgPrice === 'number' &&
    summary.darkPoolAvgPrice >= SCANNER_MIN_PRICE
  );
}
