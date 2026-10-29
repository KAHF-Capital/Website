import TickerPage from '../../src/pages/TickerPage';
import { getTickerHistory } from '../../lib/scanner-history';

const TICKER_RE = /^[A-Z][A-Z0-9.\-]{0,14}$/;

export async function getServerSideProps({ params, res }) {
  const symbol = String(params?.symbol || '').toUpperCase();
  if (!TICKER_RE.test(symbol)) {
    return { notFound: true };
  }

  if (res) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  }

  const empty = {
    symbol,
    has_data: false,
    lookback_days: 0,
    session_count: 0,
    history: [],
    total_notional_30d: 0,
    avg_volume_ratio: 0
  };

  try {
    const tape = await getTickerHistory(symbol);
    const history = (tape.days || []).map((day) => ({
      date: day.date,
      total_volume: day.total_volume,
      total_value: day.total_value,
      avg_price: day.avg_price,
      trade_count: day.trade_count,
      volume_ratio: day.volume_ratio == null ? null : day.volume_ratio
    }));
    const latest = history[history.length - 1] || null;
    const peak = history.reduce((best, day) => {
      if (day.volume_ratio == null) return best;
      if (!best || day.volume_ratio > best.volume_ratio) return day;
      return best;
    }, null);
    const totalNotional = history.reduce((sum, day) => sum + day.total_value, 0);
    const ratios = history.map((day) => day.volume_ratio).filter((ratio) => ratio != null);

    const summary = {
      symbol,
      lookback_days: history.length,
      session_count: history.length,
      has_data: history.length > 0,
      first_date: tape.firstDate,
      last_date: tape.lastDate,
      latest,
      peak,
      total_notional_30d: totalNotional,
      avg_volume_ratio: ratios.length
        ? +(ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length).toFixed(2)
        : 0,
      history
    };

    return { props: { symbol, summary, error: null } };
  } catch (err) {
    return {
      props: {
        symbol,
        summary: empty,
        error: 'Failed to load dark pool data. Please try again later.'
      }
    };
  }
}

export default function TickerSlug(props) {
  return <TickerPage {...props} />;
}
