import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { TrendingUp, TrendingDown, Minus, ShieldCheck, Loader2, Calendar } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import AskAIButton from '../components/AskAIButton';
import { track } from '../../lib/analytics';

// A read counts as "new" if the pipeline published it in the last 48h
// (found_at), falling back to the signal date for older reads without a stamp.
function isNewRead(a) {
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  if (a.found_at) return new Date(a.found_at).getTime() >= cutoff;
  return new Date(`${a.date}T00:00:00`).getTime() >= cutoff;
}

export default function Wins() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    track('wins_page_viewed');
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/wins');
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json.error || 'Failed to load');
        setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>Track Record — KAHF AI alerts | KAHF Capital</title>
        <meta name="description" content="Public track record of every dark pool alert KAHF AI has flagged. Receipts, not promises." />
      </Head>
      <Header />

      <section className="py-12 px-4 bg-gradient-to-b from-green-50/40 via-white to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold mb-4">
              <ShieldCheck className="h-3.5 w-3.5" />
              Public · Marked to the live market
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4 tracking-tight">
              Receipts &gt; promises.
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Every setup KAHF AI scored as tradeable this year — each one marked to the live options market. Open positions to market, settled ones to expiry.
            </p>
          </div>

          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="h-7 w-7 text-green-600 animate-spin" />
            </div>
          )}
          {error && (
            <div className="max-w-md mx-auto bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
                <SummaryCard label="Reads" value={data.summary.total} />
                <SummaryCard
                  label="Hit rate"
                  value={`${data.summary.hit_rate}%`}
                  color="text-green-600"
                />
                <SummaryCard
                  label="Avg winner"
                  value={`+${data.summary.avg_winner}%`}
                  color="text-green-600"
                />
                <SummaryCard
                  label="Avg loser"
                  value={`${data.summary.avg_loser}%`}
                  color="text-red-500"
                />
              </div>

              {/* Alerts list */}
              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h2 className="font-bold text-gray-900">Alert log</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Ticker</th>
                        <th className="text-right px-4 py-3">Vol Ratio</th>
                        <th className="text-right px-4 py-3 hidden sm:table-cell">Notional</th>
                        <th className="text-center px-4 py-3">Result</th>
                        <th className="text-right px-4 py-3">Est. Return</th>
                        <th className="text-right px-4 py-3 hidden md:table-cell">Note</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.alerts.map((a, i) => (
                        <tr key={`${a.ticker}-${a.date}-${i}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            <div className="inline-flex items-center gap-1.5">
                              <Calendar className="h-3.5 w-3.5 text-gray-400" />
                              {a.date}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="inline-flex items-center gap-2">
                              <Link
                                href={`/ticker/${a.ticker}`}
                                className="font-bold text-gray-900 hover:text-green-700"
                              >
                                ${a.ticker}
                              </Link>
                              {isNewRead(a) && (
                                <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-green-100 text-green-700">
                                  New
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                            {a.volume_ratio.toFixed(1)}×
                          </td>
                          <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">
                            {Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(a.total_value)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <ResultBadge result={a.result} />
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-semibold ${a.estimated_return_pct > 0 ? 'text-green-600' : a.estimated_return_pct < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                            {a.estimated_return_pct > 0 ? '+' : ''}{a.estimated_return_pct}%
                          </td>
                          <td className="px-4 py-3 text-right text-xs text-gray-500 hidden md:table-cell">
                            {a.note}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <AskAIButton
                              prompt={`Why did KAHF AI flag ${a.ticker} on ${a.date}?`}
                              ticker={a.ticker}
                              source="wins"
                              size="sm"
                            >
                              Ask AI
                            </AskAIButton>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {data.disclaimer && (
                <p className="text-[11px] text-gray-400 mt-5 max-w-3xl mx-auto leading-relaxed">{data.disclaimer}</p>
              )}
            </>
          )}
        </div>
      </section>

      <Footer />
    </div>
  );
}

function SummaryCard({ label, value, color = 'text-gray-900' }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 text-center">
      <div className={`text-3xl font-black ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1 uppercase tracking-wider">{label}</div>
    </div>
  );
}

function ResultBadge({ result }) {
  if (result === 'win') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-bold">
        <TrendingUp className="h-3 w-3" /> Win
      </span>
    );
  }
  if (result === 'loss') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
        <TrendingDown className="h-3 w-3" /> Loss
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-bold">
      <Minus className="h-3 w-3" /> Flat
    </span>
  );
}
