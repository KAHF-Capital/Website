/**
 * Legacy entrypoint. Kept for backwards compatibility — all logic now lives
 * in lib/options-analysis-service.js. Existing imports of
 * `getStraddleSuccessRate`, `analyzeHistoricalProfitability`, and
 * `calculateOverlappingMovements` continue to work unchanged.
 */

import {
  analyzeOptionsProfitability,
  calculateOverlappingMovements,
  getOptionsSuccessRate
} from './options-analysis-service.js';

export { calculateOverlappingMovements };

// Drop-in replacement for the old per-strategy analyzer. The old signature
// (historicalData, upperBreakevenPct, lowerBreakevenPct) is preserved.
export function analyzeHistoricalProfitability(historicalData, upperBreakevenPct, lowerBreakevenPct) {
  return analyzeOptionsProfitability(historicalData, {
    strategy: 'straddle',
    upperBreakevenPct,
    lowerBreakevenPct
  });
}

export async function getStraddleSuccessRate(ticker) {
  return getOptionsSuccessRate(ticker, { strategy: 'straddle' });
}
