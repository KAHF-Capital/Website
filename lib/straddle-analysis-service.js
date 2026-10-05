// Straddle-only shorthand; all logic lives in lib/options-analysis-service.js.

import { getOptionsSuccessRate } from './options-analysis-service.js';

export async function getStraddleSuccessRate(ticker) {
  return getOptionsSuccessRate(ticker, { strategy: 'straddle' });
}
