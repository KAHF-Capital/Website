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

// Growth of $100k with a flat $5k in every read: realized P/L lands on the
// exit date — expiration for calls/puts, the take-profit/stop-loss date for
// managed straddles (step-forward — nothing is known before the exit); open
// reads are added as one final marked-to-market point at today.
function buildEquityCurve(alerts) {
  const START = 100000;
  const PER_POSITION = 5000;

  const scored = alerts.filter((a) => a.result !== 'flat');
  const realized = scored.filter(
    (a) => (a.status === 'settled' && a.expiration) || (a.status === 'closed' && (a.exit_date || a.expiration))
  );
  const open = scored.filter((a) => a.status === 'open');
  if (realized.length === 0) return null;

  const pnlByExit = {};
  for (const a of realized) {
    const exitDate = a.status === 'closed' ? (a.exit_date || a.expiration) : a.expiration;
    pnlByExit[exitDate] = (pnlByExit[exitDate] || 0) + PER_POSITION * (a.estimated_return_pct / 100);
  }

  const firstSignal = alerts.reduce((m, a) => (a.date < m ? a.date : m), '9999-12-31');
  const points = [{ date: firstSignal, value: START, open: false }];
  let equity = START;
  for (const d of Object.keys(pnlByExit).sort()) {
    equity += pnlByExit[d];
    points.push({ date: d, value: equity, open: false });
  }

  const openPnl = open.reduce((s, a) => s + PER_POSITION * (a.estimated_return_pct / 100), 0);
  if (open.length > 0) {
    points.push({ date: new Date().toISOString().slice(0, 10), value: equity + openPnl, open: true });
  }

  return { points, settledEquity: equity, openCount: open.length, perPosition: PER_POSITION, start: START };
}

function GrowthChart({ alerts }) {
  const curve = buildEquityCurve(alerts);
  if (!curve || curve.points.length < 2) return null;

  const { points, start } = curve;
  const W = 800;
  const H = 240;
  const PAD = { top: 14, right: 14, bottom: 26, left: 62 };

  const t0 = new Date(`${points[0].date}T00:00:00`).getTime();
  const t1 = new Date(`${points[points.length - 1].date}T00:00:00`).getTime();
  const values = points.map((p) => p.value).concat(start);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const span = Math.max(vMax - vMin, 1) * 0.08;
  const yLo = vMin - span;
  const yHi = vMax + span;

  const x = (d) => PAD.left + ((new Date(`${d}T00:00:00`).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  const coords = points.map((p) => ({ px: x(p.date), py: y(p.value), open: p.open }));
  // Solid line through settled points; dashed final segment for the open mark.
  const lastSettledIdx = points[points.length - 1].open ? coords.length - 2 : coords.length - 1;
  const solidPath = coords.slice(0, lastSettledIdx + 1).map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ');
  const dashedPath = points[points.length - 1].open
    ? `M${coords[lastSettledIdx].px.toFixed(1)},${coords[lastSettledIdx].py.toFixed(1)} L${coords[coords.length - 1].px.toFixed(1)},${coords[coords.length - 1].py.toFixed(1)}`
    : null;
  const areaPath = `${coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ')} L${coords[coords.length - 1].px.toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${coords[0].px.toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

  const finalValue = points[points.length - 1].value;
  const totalReturnPct = ((finalValue - start) / start) * 100;
  const up = finalValue >= start;
  const money = (v) => Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const gridValues = [start, yHi - span, yLo + span].filter((v, i, arr) => arr.findIndex((o) => Math.abs(o - v) < (yHi - yLo) * 0.06) === i);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-10">
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-bold text-gray-900">Growth of $100,000</h2>
        <div className="text-sm">
          <span className={`font-mono font-bold ${up ? 'text-green-600' : 'text-red-500'}`}>{money(finalValue)}</span>
          <span className={`ml-2 font-mono ${up ? 'text-green-600' : 'text-red-500'}`}>
            ({totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(1)}%)
          </span>
        </div>
      </div>
      <div className="px-2 pt-4 pb-2 sm:px-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Hypothetical growth of $100,000 investing $5,000 per read: currently ${money(finalValue)}`}>
          {gridValues.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={v === start ? '4 4' : undefined} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af" fontFamily="ui-monospace, monospace">
                {Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(v)}
              </text>
            </g>
          ))}
          <path d={areaPath} fill={up ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)'} />
          <path d={solidPath} fill="none" stroke={up ? '#16a34a' : '#ef4444'} strokeWidth="2.5" strokeLinejoin="round" />
          {dashedPath && (
            <path d={dashedPath} fill="none" stroke={up ? '#16a34a' : '#ef4444'} strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
          )}
          {coords.map((c, i) => (
            <circle key={i} cx={c.px} cy={c.py} r={i === coords.length - 1 ? 4 : 2.5} fill={up ? '#16a34a' : '#ef4444'} />
          ))}
          <text x={PAD.left} y={H - 8} fontSize="11" fill="#9ca3af">{fmtDate(points[0].date)}</text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="11" fill="#9ca3af">{fmtDate(points[points.length - 1].date)}</text>
        </svg>
      </div>
      <p className="px-6 pb-4 text-[11px] text-gray-400 leading-relaxed">
        Hypothetical: $5,000 allocated to every read at signal. Calls and puts held to expiry; straddles exit at +40% take-profit or −30% stop-loss. Each step is an exit date.
        {curve.openCount > 0 && ' Dashed segment adds the current mark-to-market value of open positions.'}
        {' '}Not live-traded; excludes commissions and slippage.
      </p>
    </div>
  );
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

              {/* Growth of $100k equity curve */}
              <GrowthChart alerts={data.alerts} />

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
