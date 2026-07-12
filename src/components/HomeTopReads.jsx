import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { TrendingUp, ArrowRight, Trophy } from 'lucide-react';

const MAX_WINNERS = 6;

function fmtPct(v) {
  if (v === null || v === undefined) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function fmtDate(iso) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function WinnerCard({ w, rank }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-gray-900 text-lg">{w.ticker}</span>
          {w.structure_label && (
            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
              {w.structure_label}
            </span>
          )}
        </div>
        {rank === 0 && (
          <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md bg-amber-50 text-amber-600 inline-flex items-center gap-1">
            <Trophy className="h-3 w-3" /> Top read
          </span>
        )}
      </div>

      <div className="flex items-baseline gap-2 mb-2">
        <TrendingUp className="h-5 w-5 text-green-600" />
        <span className="text-3xl font-extrabold text-green-600">{fmtPct(w.estimated_return_pct)}</span>
      </div>

      <p className="text-xs text-gray-500 mt-auto">Flagged {fmtDate(w.date)}</p>
    </div>
  );
}

export default function HomeTopReads() {
  const [winners, setWinners] = useState(null);
  const [error, setError] = useState(false);
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    let mounted = true;
    fetch('/api/wins')
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!mounted) return;
        const yearStart = `${new Date().getFullYear()}-01-01`;
        const top = (d.alerts || [])
          .filter((a) => a.result === 'win' && a.date >= yearStart && a.estimated_return_pct > 0)
          .sort((a, b) => b.estimated_return_pct - a.estimated_return_pct)
          .slice(0, MAX_WINNERS);
        setWinners(top);
        setDisclaimer(d.disclaimer || '');
      })
      .catch(() => mounted && setError(true));
    return () => {
      mounted = false;
    };
  }, []);

  if (error || (winners && winners.length === 0)) return null;

  return (
    <section className="py-16 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <p className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-2 flex items-center justify-center gap-1.5">
            <Trophy className="h-4 w-4" /> Biggest winners · {new Date().getFullYear()}
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">
            The best reads of the year.
          </h2>
          <p className="text-gray-600 mt-3 max-w-2xl mx-auto">
            KAHF AI's highest-returning reads this year, marked to the live options market.
            The complete history — every read, wins and losses — lives on the track record page.
          </p>
        </div>

        {!winners ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-36 bg-white border border-gray-200 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {winners.map((w, i) => (
              <WinnerCard key={`${w.ticker}-${w.date}-${i}`} w={w} rank={i} />
            ))}
          </div>
        )}

        <div className="text-center mt-8">
          <Link
            href="/wins"
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            See the full track record <ArrowRight className="h-4 w-4" />
          </Link>
          <p className="text-xs text-gray-500 mt-3">
            Win rate, average return, and open positions are all on the track record page.
          </p>
          {disclaimer && (
            <p className="text-[11px] text-gray-500 mt-5 max-w-3xl mx-auto leading-relaxed">
              Showing selected top performers only — not representative of all reads. {disclaimer}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
