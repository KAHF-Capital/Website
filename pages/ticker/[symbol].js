import TickerPage from '../../src/pages/TickerPage';
import { listDataFiles, getDataFile } from '../../lib/blob-data';

const TICKER_RE = /^[A-Z]{1,6}$/;
const LOOKBACK_FILES = 30;

export async function getServerSideProps({ params, res }) {
  const symbol = String(params?.symbol || '').toUpperCase();
  if (!TICKER_RE.test(symbol)) {
    return { notFound: true };
  }

  // Cache page for SEO crawlers and humans
  if (res) {
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
  }

  try {
    const files = (await listDataFiles()).slice(0, LOOKBACK_FILES);
    const history = [];
    for (const file of files) {
      let data;
      try {
        data = await getDataFile(file.url);
      } catch {
        continue;
      }
      if (!data?.tickers) continue;
      const t = data.tickers.find((x) => x.ticker === symbol);
      const date = (file.filename.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || data.date;
      if (t) {
        history.push({
          date,
          total_volume: Number(t.total_volume || 0),
          total_value: Number(t.total_value || 0),
          avg_price: Number(t.avg_price || 0),
          trade_count: Number(t.trade_count || 0),
          volume_ratio: Number(t.volume_ratio || 0)
        });
      }
    }
    history.sort((a, b) => a.date.localeCompare(b.date));

    const latest = history[history.length - 1] || null;
    const peak = history.reduce((m, h) => (!m || h.volume_ratio > m.volume_ratio ? h : m), null);
    const totalNotional = history.reduce((s, h) => s + h.total_value, 0);

    const summary = {
      symbol,
      lookback_days: LOOKBACK_FILES,
      has_data: history.length > 0,
      latest,
      peak,
      total_notional_30d: totalNotional,
      avg_volume_ratio: history.length ? +(history.reduce((s, h) => s + h.volume_ratio, 0) / history.length).toFixed(2) : 0,
      history
    };

    return { props: { symbol, summary, error: null } };
  } catch (err) {
    return {
      props: {
        symbol,
        summary: { symbol, has_data: false, lookback_days: LOOKBACK_FILES, history: [] },
        error: 'Failed to load dark pool data. Please try again later.'
      }
    };
  }
}

export default function TickerSlug(props) {
  return <TickerPage {...props} />;
}
