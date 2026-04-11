import { getHistoricalStockData, calculatePriceMovements } from '../../lib/polygon-data-service.js';
import { analyzeHistoricalProfitability, calculateOverlappingMovements } from '../../lib/straddle-analysis-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, strikePrice, totalPremium, daysToExpiration } = req.body;

  if (!ticker || !totalPremium) {
    return res.status(400).json({ error: 'Missing required parameters: ticker and totalPremium are required' });
  }

  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  const effectiveStrikePrice = strikePrice || 100;

  try {
    const upperBreakeven = effectiveStrikePrice + totalPremium;
    const lowerBreakeven = effectiveStrikePrice - totalPremium;
    const upperBreakevenPct = (upperBreakeven - effectiveStrikePrice) / effectiveStrikePrice;
    const lowerBreakevenPct = (lowerBreakeven - effectiveStrikePrice) / effectiveStrikePrice;

    const dte = daysToExpiration || 30;
    const MIN_PERIODS = 25;

    const endDate = new Date().toISOString().split('T')[0];
    const calendarDaysNeeded = Math.max(750, Math.ceil((MIN_PERIODS * dte) / 0.7) + 60);
    const startDate = new Date(Date.now() - calendarDaysNeeded * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const historicalData = await getHistoricalStockData(ticker, startDate, endDate);

    let movements = calculatePriceMovements(historicalData, dte);
    if (movements.length < MIN_PERIODS) {
      movements = calculateOverlappingMovements(historicalData, dte);
    }

    const analysis = analyzeHistoricalProfitability(movements, upperBreakevenPct, lowerBreakevenPct);

    analysis.periodsRequested = MIN_PERIODS;
    analysis.periodsFound = movements.length;
    analysis.historyYears = historicalData.length > 0
      ? ((new Date(historicalData[historicalData.length - 1].date) - new Date(historicalData[0].date)) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)
      : 0;

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in straddle analysis:', error);
    res.status(500).json({ error: 'Failed to perform analysis' });
  }
}
