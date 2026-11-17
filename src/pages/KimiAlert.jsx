import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, FlaskConical, Loader2 } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { fmt, useKimiApi } from '../components/kimi/useKimiApi';

const FIELD_LABELS = {
  date: 'Signal date',
  ticker: 'Ticker',
  dark_pool_value: 'Dark pool notional',
  dark_pool_avg_price: 'Average print price',
  volume_ratio: 'Volume vs 7-day average',
  structure: 'Backend read',
  direction: 'Direction',
  strike: 'Strike',
  expiration: 'Expiration',
  dte: 'Days to expiration',
  entry_premium: 'Entry premium',
  asof_hit_rate: 'Historical hit rate',
  asof_samples: 'Hit-rate windows',
  found_at: 'Published by backend'
};

function formatField(key, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (key === 'dark_pool_value') return fmt.usd(value);
  if (key === 'dark_pool_avg_price' || key === 'entry_premium' || key === 'strike') return `$${Number(value).toFixed(2)}`;
  if (key === 'volume_ratio') return `${Number(value).toFixed(2)}x`;
  if (key === 'asof_hit_rate') return `${value}%`;
  if (key === 'found_at') return fmt.dateTime(value);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

export default function KimiAlert() {
  const router = useRouter();
  const { id } = router.query;
  const { api, ready, signedIn } = useKimiApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || !ready) return;
    if (!signedIn) {
      router.replace(`/login?redirect=${encodeURIComponent(`/kimi/alerts/${id}`)}`);
      return;
    }
    api(`/api/kimi/alerts/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id, ready, signedIn, api, router]);

  const backtest = async () => {
    setBusy(true);
    try {
      const res = await api('/api/kimi/backtests', { method: 'POST', body: { config: { alert_id: id } } });
      router.push(`/kimi/backtests/${res.job_id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const a = data?.alert;
  const fr = a?.forward_returns;
  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Head>
        <title>{a ? `$${a.ticker} alert · Kaia` : 'Alert · Kaia'}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link href="/kimi?tab=alerts" className="mb-5 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Alert history
        </Link>
        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {!a && !error && (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        )}
        {a && (
          <div className="space-y-5">
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Dark pool alert</p>
                  <h1 className="mt-1 text-3xl font-black text-gray-900">${a.ticker}</h1>
                  <p className="mt-1 text-sm text-gray-600">
                    Signal {fmt.date(a.signal_date)} · sent {fmt.dateTime(a.sent_at)}
                  </p>
                  {a.status === 'retracted' && <p className="mt-2 text-sm font-semibold text-red-600">The backend later retracted this signal.</p>}
                </div>
                <button type="button" onClick={backtest} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Backtest this setup
                </button>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Notional', fmt.usd(a.notional)],
                  ['Volume', a.volume_ratio ? `${a.volume_ratio.toFixed(1)}x 7d` : '—'],
                  ['T+1d', typeof fr?.t1d?.return_pct === 'number' ? fmt.pct(fr.t1d.return_pct, 2, true) : 'pending'],
                  ['T+5d', typeof fr?.t5d?.return_pct === 'number' ? fmt.pct(fr.t5d.return_pct, 2, true) : 'pending']
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <div className="text-[11px] uppercase tracking-wider text-gray-500">{label}</div>
                    <div className="mt-0.5 font-mono text-base font-bold text-gray-900">{value}</div>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-bold text-gray-900">Backend signal</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                Exactly as KAHF&apos;s backend published it (id {a.alert_id}
                {a.backend_param_version ? `, method: ${a.backend_param_version}` : ''}).
              </p>
              <dl className="mt-4 divide-y divide-gray-100 text-sm">
                {Object.entries(a.signal_payload || {})
                  .filter(([k]) => k !== 'contracts')
                  .map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4 py-2">
                      <dt className="text-gray-500">{FIELD_LABELS[k] || k}</dt>
                      <dd className="text-right font-mono text-gray-900">{formatField(k, v)}</dd>
                    </div>
                  ))}
              </dl>
              {fr?.base_close && (
                <p className="mt-4 text-xs text-gray-500">
                  Forward returns use daily closes from {fr.base_date} (${fr.base_close}). They describe what the stock did after the signal and are not a trade result.
                </p>
              )}
            </section>
            <p className="text-xs leading-relaxed text-gray-500">{data.disclaimer}</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
