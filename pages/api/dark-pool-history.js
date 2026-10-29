import { getTickerHistory } from '../../lib/scanner-history';
import { VOLUME_RATIO_METHOD } from '../../lib/scanner-math';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, asOf } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker parameter is required' });
  }

  try {
    const history = await getTickerHistory(ticker, { asOf: typeof asOf === 'string' ? asOf : null });
    if (!history.available && history.reason === 'Invalid ticker') {
      return res.status(400).json({ error: 'Invalid ticker' });
    }

    const data = (history.days || []).map((day) => ({
      date: day.date,
      total_volume: day.total_volume,
      trade_count: day.trade_count,
      avg_price: day.avg_price,
      total_value: day.total_value,
      avg_7day_volume: day.avg_7day_volume,
      volume_ratio: day.volume_ratio,
      window_days: day.window_days
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400');
    return res.status(200).json({
      ticker: history.ticker,
      data,
      total_days: data.length,
      first_date: history.firstDate,
      last_date: history.lastDate,
      as_of: history.asOf,
      days_withheld_after_as_of: history.daysWithheldAfterAsOf || 0,
      lookahead: false,
      volume_ratio_method: VOLUME_RATIO_METHOD
    });
  } catch (error) {
    console.error('Error fetching dark pool history:', error);
    return res.status(500).json({ error: 'Failed to fetch dark pool history' });
  }
}
