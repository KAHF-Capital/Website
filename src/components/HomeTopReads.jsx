import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, TrendingDown, ArrowRight, Activity } from 'lucide-react';

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function ReadCard({ r }) {
  const up = (r.returnPct ?? 0) >= 0;
  const pending = r.returnPct === null;
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900 text-lg">{r.ticker}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
            {r.structureLabel}
          </span>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md ${
            r.status === 'open' ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
          }`}
        >
          {r.status === 'open' ? 'Open' : 'Closed'}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        {pending ? (
          <span className="text-2xl font-extrabold text-gray-400">Pending</span>
        ) : (
          <>
            {up ? (
              <TrendingUp className="h-5 w-5 text-green-600" />
            ) : (
              <TrendingDown className="h-5 w-5 text-red-500" />
            )}
            <span className={`text-2xl font-extrabold ${up ? 'text-green-600' : 'text-red-500'}`}>
              {fmtPct(r.returnPct)}
            </span>
          </>
        )}
      </div>

      <dl className="text-xs text-gray-500 space-y-1 mt-auto">
        <div className="flex justify-between">
          <dt>Flagged</dt>
          <dd className="text-gray-700 font-medium">{r.date}</dd>
        </div>
        <div className="flex justify-between">
          <dt>Conviction</dt>
          <dd className="text-gray-700 font-medium">{r.volumeRatio}× dark pool</dd>
        </div>
        <div className="flex justify-between">
          <dt>Entry → {r.status === 'open' ? 'Now' : 'Settle'}</dt>
          <dd className="text-gray-700 font-medium">
            ${r.entryPremium?.toFixed(2)} → {r.currentPremium != null ? `$${r.currentPremium.toFixed(2)}` : '—'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export default function HomeTopReads() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let mounted = true;
    fetch('/api/top-reads')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => mounted && setData(d))
      .catch(() => mounted && setError(true));
    return () => {
      mounted = false;
    };
  }, []);

  if (error || (data && (!data.reads || data.reads.length === 0))) return null;

  const s = data?.summary;

  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-3">
          <p className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
            <Activity className="h-4 w-4" /> Live scoreboard
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            Recent reads, marked to the live market.
          </h2>
          <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
            The top setups KAHF AI scored as tradeable over the last {data ? data.window_days : 90} days — open
            positions marked to market, closed ones settled. No cherry-picking.
          </p>
        </div>

        {s && (
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 my-7 text-center">
            <div>
              <div className="text-2xl font-extrabold text-gray-900">{s.total}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Reads</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-gray-900">{s.hitRate}%</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Win rate</div>
            </div>
            <div>
              <div className={`text-2xl font-extrabold ${s.avgReturn >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                {fmtPct(s.avgReturn)}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Avg return</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-blue-600">{s.open}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Still open</div>
            </div>
          </div>
        )}

        {!data ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-44 bg-white border border-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {data.reads.map((r, i) => (
              <ReadCard key={`${r.ticker}-${r.date}-${i}`} r={r} />
            ))}
          </div>
        )}

        <div className="text-center mt-8">
          <Link
            href="/wins"
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            See the full YTD history <ArrowRight className="h-4 w-4" />
          </Link>
          {data?.disclaimer && (
            <p className="text-[11px] text-gray-400 mt-5 max-w-3xl mx-auto leading-relaxed">{data.disclaimer}</p>
          )}
        </div>
      </div>
    </section>
  );
}
