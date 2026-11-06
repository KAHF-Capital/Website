import React, { useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Download, Loader2, TriangleAlert } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { COLORS, EquityChart } from '../components/kimi/charts';
import { downloadCsv } from '../components/kimi/csv';
import { fmt, useKimiApi } from '../components/kimi/useKimiApi';

const STRUCTURE_COLORS = { call: COLORS.green, put: COLORS.red, straddle: COLORS.blue };
const RANK_LABELS = { sharpe: 'Sharpe', win_rate: 'win rate', avg_return: 'average return', max_drawdown: 'max drawdown' };

const signed = (v) => (typeof v === 'number' ? fmt.pct(v, 1, true) : '—');

export default function KimiBacktestResult() {
  const router = useRouter();
  const { id } = router.query;
  const { api, ready, signedIn } = useKimiApi();
  const [job, setJob] = useState(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!id || !ready) return undefined;
    if (!signedIn) {
      router.replace(`/login?redirect=${encodeURIComponent(`/kimi/backtests/${id}`)}`);
      return undefined;
    }
    let timer = null;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await api(`/api/kimi/backtests/${encodeURIComponent(id)}`);
        if (cancelled) return;
        setJob(res.backtest);
        setDisclaimer(res.disclaimer);
        if (res.backtest.status === 'queued' || res.backtest.status === 'running') timer = setTimeout(load, 2500);
      } catch (err) {
        if (!cancelled) setError(err.status === 403 ? 'This backtest belongs to another account.' : err.message);
      }
    };
    load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, ready, signedIn, api, router]);

  const results = job?.results || [];
  const active = results.find((r) => r.structure === selected) || results[0];
  const equitySeries = useMemo(
    () => results.map((r) => ({ key: r.structure, label: r.label, color: STRUCTURE_COLORS[r.structure] || COLORS.slate, points: r.equity_curve || [], emphasis: active ? r.structure === active.structure : undefined })),
    [results, active]
  );
  const pending = job && (job.status === 'queued' || job.status === 'running');

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Head>
        <title>{job ? `$${job.ticker} backtest · Kimi` : 'Backtest · Kimi'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <Link href="/kimi?tab=backtests" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Your backtests
        </Link>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!job && !error && <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>}
        {job && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-700">
                    Structure comparison · ranked by {RANK_LABELS[job.rank_by] || job.rank_by}
                  </p>
                  <h1 className="mt-1 text-3xl font-black text-gray-900">${job.ticker}</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    {job.source === 'alert' ? `From alert ${job.alert_id}` : job.source === 'web' ? 'Run from the web' : 'Run by text'} · {fmt.dateTime(job.created_at)}
                    {job.runtime_ms ? ` · ${fmt.ms(job.runtime_ms)}` : ''}
                  </p>
                </div>
                {pending && (
                  <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Running on KAHF&apos;s backtest API…
                  </span>
                )}
              </div>
              {job.status === 'failed' && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">This backtest didn&apos;t finish: {job.error}</p>}
              {job.caveats?.length > 0 && (
                <ul className="mt-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {job.caveats.map((c) => (
                    <li key={c} className="flex gap-2">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {c}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {results.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-bold text-gray-900">Full stats</h2>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
                      <tr>
                        <th className="py-2 pr-3">#</th>
                        <th className="py-2 pr-3">Structure</th>
                        <th className="py-2 pr-3 text-right">Trades</th>
                        <th className="py-2 pr-3 text-right">Win rate</th>
                        <th className="py-2 pr-3 text-right">Avg return</th>
                        <th className="py-2 pr-3 text-right">Median</th>
                        <th className="py-2 pr-3 text-right">Max drawdown</th>
                        <th className="py-2 pr-3 text-right">Sharpe</th>
                        <th className="py-2 pr-3 text-right">Best / worst</th>
                        <th className="py-2 text-right">P&amp;L at $5k per trade</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {results.map((r) => (
                        <tr key={r.structure} onClick={() => setSelected(r.structure)} className={`cursor-pointer ${active?.structure === r.structure ? 'bg-green-50/60' : 'hover:bg-gray-50'}`}>
                          <td className="py-2 pr-3 font-mono text-gray-500">{r.rank}</td>
                          <td className="py-2 pr-3 font-semibold text-gray-900">
                            <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full" style={{ background: STRUCTURE_COLORS[r.structure] }} />
                            {r.label}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono">{r.trades}</td>
                          <td className="py-2 pr-3 text-right font-mono">{fmt.pct(r.win_rate)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{signed(r.avg_return)}</td>
                          <td className="py-2 pr-3 text-right font-mono">{signed(r.median_return)}</td>
                          <td className="py-2 pr-3 text-right font-mono text-red-600">{typeof r.max_drawdown === 'number' ? fmt.pct(r.max_drawdown) : '—'}</td>
                          <td className="py-2 pr-3 text-right font-mono">{r.sharpe ?? '—'}</td>
                          <td className="py-2 pr-3 text-right font-mono text-gray-600">
                            {signed(r.best_return)} / {signed(r.worst_return)}
                          </td>
                          <td className={`py-2 text-right font-mono ${r.total_pnl_usd >= 0 ? 'text-green-700' : 'text-red-600'}`}>{typeof r.total_pnl_usd === 'number' ? fmt.usd(r.total_pnl_usd) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {job.errors?.length > 0 && (
                  <p className="mt-3 text-xs text-gray-500">Not evaluated: {job.errors.map((e) => `${e.structure} (${e.error})`).join('; ')}</p>
                )}
                <p className="mt-3 text-xs leading-relaxed text-gray-500">
                  Trades and win rate come from KAHF&apos;s backtest API (runHistoricalAnalysis) using the live ATM premium. Average and median return, drawdown, Sharpe and P&amp;L are hold-to-expiry payoffs Kimi computed from the same historical windows; they are shown only when they reproduce the API&apos;s own trade and win counts.
                </p>
              </section>
            )}

            {results.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900">Equity curve</h2>
                  <span className="text-xs text-gray-500">$100,000 start, $5,000 per window, windows in date order</span>
                </div>
                <EquityChart series={equitySeries} />
              </section>
            )}

            {active && (
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-base font-bold text-gray-900">Trade list · {active.label}</h2>
                  <div className="flex items-center gap-2">
                    {results.map((r) => (
                      <button key={r.structure} type="button" onClick={() => setSelected(r.structure)} className={`rounded-full px-3 py-1 text-xs font-semibold ${active.structure === r.structure ? 'bg-gray-900 text-white' : 'border border-gray-200 text-gray-700'}`}>
                        {r.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        downloadCsv(`kimi-${job.ticker}-${active.structure}-trades`, active.trade_list || [], [
                          { key: 'entry_date', label: 'Entry date' },
                          { key: 'exit_date', label: 'Exit date' },
                          { key: 'entry_close', label: 'Entry close' },
                          { key: 'exit_close', label: 'Exit close' },
                          { key: 'move_pct', label: 'Underlying move %' },
                          { key: 'return_pct', label: 'Return %' },
                          { key: 'pnl_usd', label: 'P&L at $5k' }
                        ])
                      }
                      className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-700 hover:bg-gray-50"
                    >
                      <Download className="h-3.5 w-3.5" /> CSV
                    </button>
                  </div>
                </div>
                {!active.trade_list?.length ? (
                  <p className="py-6 text-center text-sm text-gray-500">No trade-level detail for this structure.</p>
                ) : (
                  <div className="max-h-[420px] overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wider text-gray-500">
                        <tr>
                          <th className="py-2 pr-3">Entry</th>
                          <th className="py-2 pr-3">Exit (expiry)</th>
                          <th className="py-2 pr-3 text-right">Entry close</th>
                          <th className="py-2 pr-3 text-right">Exit close</th>
                          <th className="py-2 pr-3 text-right">Underlying</th>
                          <th className="py-2 pr-3 text-right">Return</th>
                          <th className="py-2 text-right">P&amp;L</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 font-mono text-xs">
                        {active.trade_list.map((t) => (
                          <tr key={`${t.entry_date}-${t.exit_date}`}>
                            <td className="py-1.5 pr-3">{t.entry_date}</td>
                            <td className="py-1.5 pr-3">{t.exit_date}</td>
                            <td className="py-1.5 pr-3 text-right">${t.entry_close}</td>
                            <td className="py-1.5 pr-3 text-right">${t.exit_close}</td>
                            <td className="py-1.5 pr-3 text-right">{fmt.pct(t.move_pct, 2, true)}</td>
                            <td className={`py-1.5 pr-3 text-right font-bold ${t.return_pct > 0 ? 'text-green-700' : 'text-red-600'}`}>{fmt.pct(t.return_pct, 1, true)}</td>
                            <td className="py-1.5 text-right">{fmt.usd(t.pnl_usd)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900">Config used</h2>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['Ticker', `$${job.ticker}`],
                    ['Structures', (job.request?.structures || []).join(', ')],
                    ['Days to expiration', job.request?.days_to_expiration],
                    ['History through', job.request?.as_of_date || 'today'],
                    ['Ranked by', RANK_LABELS[job.rank_by] || job.rank_by],
                    ['Source', job.source === 'alert' ? `Alert ${job.alert_id}` : job.source]
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-gray-500">{k}</dt>
                      <dd className="font-mono text-gray-900">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="space-y-2 text-xs">
                  {results.map((r) => (
                    <div key={r.structure} className="rounded-lg bg-gray-50 px-3 py-2 font-mono text-gray-700">
                      <span className="font-sans font-semibold text-gray-900">{r.label}</span>: strike ${r.quote?.strike}, premium ${r.quote?.premium}, exp {r.quote?.expiration} ({r.quote?.days_to_expiration}d), history {r.history_start} to {r.history_end}
                    </div>
                  ))}
                </div>
              </div>
              {job.signal_reference && (
                <p className="mt-4 text-xs text-gray-500">
                  Backend signal {job.signal_reference.backend_signal_id}: the backend&apos;s own read was {job.signal_reference.published_structure || 'n/a'} at ${job.signal_reference.published_entry_premium ?? 'n/a'} with a {job.signal_reference.published_hit_rate ?? 'n/a'}% historical hit rate. The backtest API cannot condition entries on the signal, so this run uses the backtest API on the signal&apos;s ticker with history capped at the signal date.
                </p>
              )}
            </section>

            {job.signal_history?.length > 0 && (
              <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
                <h2 className="text-base font-bold text-gray-900">This signal&apos;s track record on ${job.ticker}</h2>
                <p className="mt-0.5 text-xs text-gray-500">Past backend signals on this ticker, marked by KAHF&apos;s track-record engine.</p>
                <table className="mt-3 w-full text-sm">
                  <tbody className="divide-y divide-gray-100">
                    {job.signal_history.map((s) => (
                      <tr key={s.backend_signal_id}>
                        <td className="py-1.5 pr-3 font-mono text-xs">{s.date}</td>
                        <td className="py-1.5 pr-3">{s.label || '—'}{s.is_this_signal ? ' (this alert)' : ''}</td>
                        <td className="py-1.5 pr-3 text-gray-600">{s.status || 'unmarked'}</td>
                        <td className="py-1.5 text-right font-mono">{signed(s.return_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <p className="text-xs leading-relaxed text-gray-500">{disclaimer}</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
