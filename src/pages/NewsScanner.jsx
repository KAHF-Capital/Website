import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { Info, RefreshCw, Search } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';

const WINDOWS = [7, 14, 30, 45];

const TYPES = [
  { id: 'all', label: 'All' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'fda', label: 'FDA' },
  { id: 'ma', label: 'M&A' },
  { id: 'dividend', label: 'Dividends' },
  { id: 'macro', label: 'Macro' },
  { id: 'split', label: 'Splits' },
  { id: 'ipo', label: 'IPOs' }
];

const TYPE_STYLES = {
  earnings: 'bg-green-100 text-green-800',
  fda: 'bg-violet-100 text-violet-800',
  ma: 'bg-amber-100 text-amber-800',
  dividend: 'bg-emerald-100 text-emerald-800',
  macro: 'bg-blue-100 text-blue-800',
  split: 'bg-sky-100 text-sky-800',
  ipo: 'bg-gray-200 text-gray-800'
};

function formatEventDate(iso) {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric'
  });
}

function EventBadge({ event }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${TYPE_STYLES[event.eventType] || TYPE_STYLES.ipo}`}>
      {event.eventLabel}
    </span>
  );
}

function StatusText({ event }) {
  const label = event.dateStatus === 'confirmed'
    ? 'Confirmed'
    : event.dateStatus === 'announced'
      ? 'Announced'
      : 'Estimated';
  const color = event.dateStatus === 'confirmed'
    ? 'text-green-700'
    : event.dateStatus === 'announced'
      ? 'text-gray-600'
      : 'text-amber-700';
  return <span className={color}>{label}</span>;
}

export default function NewsScanner() {
  const [days, setDays] = useState(30);
  const [type, setType] = useState('all');
  const [tickerQuery, setTickerQuery] = useState('');
  const [events, setEvents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/news-scanner?days=${days}`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.details || data.error || 'Could not load the calendar');
        }
        if (!cancelled) {
          setEvents(Array.isArray(data.events) ? data.events : []);
          setMeta(data);
        }
      } catch (err) {
        if (!cancelled) {
          setEvents([]);
          setMeta(null);
          setError(err.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [days, reloadKey]);

  const visible = useMemo(() => {
    const query = tickerQuery.trim().toUpperCase();
    return events.filter((event) => {
      if (type !== 'all' && event.eventType !== type) return false;
      if (!query) return true;
      return event.ticker.includes(query) || (event.name || '').toUpperCase().includes(query);
    });
  }, [events, type, tickerQuery]);

  const counts = useMemo(() => {
    const next = { all: events.length };
    for (const event of events) next[event.eventType] = (next[event.eventType] || 0) + 1;
    return next;
  }, [events]);

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>News Scanner — Upcoming Catalysts | KAHF Capital</title>
        <meta
          name="description"
          content="Upcoming earnings, FDA dates, deal closes, splits, and IPOs. Only events with an exact calendar date."
        />
      </Head>
      <Header />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">News Scanner</h1>
            <button
              type="button"
              onClick={() => setShowInfo((open) => !open)}
              className="p-2 text-gray-500 hover:text-green-600 transition-colors"
              title="How it works"
            >
              <Info className="h-6 w-6" />
            </button>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="p-2 text-gray-500 hover:text-green-600 transition-colors"
              title="Refresh"
              disabled={loading}
            >
              <RefreshCw className={`h-6 w-6 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <p className="text-lg text-gray-600">
            Dated catalysts
            {meta?.from && meta?.to ? ` · ${formatEventDate(meta.from)} – ${formatEventDate(meta.to)}` : ''}
          </p>

          {showInfo && (
            <div className="mt-4 max-w-3xl bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 space-y-2">
              <p>Earnings and dividends use the report date or the ex-dividend date. Macro is the major US releases: CPI, payrolls, FOMC, and the like.</p>
              <p>FDA and M&amp;A rows are dated on the announcement. A future PDUFA day or an exact deal-close day is shown when the calendar has one. Quarter-only close dates stay in the detail.</p>
              <p>Splits and IPOs appear when an upcoming date is available. Index additions are not on this calendar.</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-wrap items-center gap-2">
            {WINDOWS.map((windowDays) => (
              <button
                key={windowDays}
                type="button"
                onClick={() => setDays(windowDays)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                  days === windowDays
                    ? 'bg-green-600 text-white border-green-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                }`}
              >
                {windowDays} days
              </button>
            ))}
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-3">
            <div className="flex flex-wrap gap-2">
              {TYPES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setType(item.id)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    type === item.id
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                  }`}
                >
                  {item.label}
                  {!loading && counts[item.id] ? ` ${counts[item.id]}` : ''}
                </button>
              ))}
            </div>
            <label className="relative lg:ml-auto w-full lg:w-64">
              <Search className="h-4 w-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={tickerQuery}
                onChange={(event) => setTickerQuery(event.target.value)}
                placeholder="Ticker or company"
                className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </label>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-8">
            <h2 className="text-lg font-semibold text-red-800 mb-1">Calendar unavailable</h2>
            <p className="text-red-700 text-sm mb-4">{error}</p>
            <button
              type="button"
              onClick={() => setReloadKey((key) => key + 1)}
              className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        )}

        {loading && !error && (
          <div className="py-16 text-center">
            <RefreshCw className="h-8 w-8 text-green-600 animate-spin mx-auto mb-4" />
            <p className="text-gray-600">Loading dated catalysts…</p>
          </div>
        )}

        {!loading && !error && visible.length === 0 && (
          <div className="py-16 text-center border border-dashed border-gray-300 rounded-xl">
            <p className="text-gray-700 font-medium">No dated catalysts in this window.</p>
            <p className="text-sm text-gray-500 mt-1">Try a longer window or clear the ticker filter.</p>
          </div>
        )}

        {!loading && !error && visible.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              {visible.length} event{visible.length === 1 ? '' : 's'}
              {meta?.warnings?.length ? ' · some calendars did not respond' : ''}
            </p>

            <div className="hidden md:block overflow-x-auto border border-gray-200 rounded-xl">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-500">
                  <tr>
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Ticker</th>
                    <th className="px-4 py-3 font-medium">Event</th>
                    <th className="px-4 py-3 font-medium">Detail</th>
                    <th className="px-4 py-3 font-medium">Session</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((event) => (
                    <tr key={event.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{formatEventDate(event.eventDate)}</td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {event.linkTicker === false ? (
                          <span className="font-semibold text-gray-900">{event.ticker}</span>
                        ) : (
                          <Link href={`/ticker/${event.ticker}`} className="font-semibold text-gray-900 hover:text-green-700">
                            {event.ticker}
                          </Link>
                        )}
                        {event.name && <div className="text-xs text-gray-500 max-w-[14rem] truncate">{event.name}</div>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"><EventBadge event={event} /></td>
                      <td className="px-4 py-3 text-gray-700 max-w-md">
                        {event.sourceUrl ? (
                          <a href={event.sourceUrl} target="_blank" rel="noopener noreferrer" className="hover:text-green-700">
                            {event.detail}
                          </a>
                        ) : event.detail}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">{event.session || '—'}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold"><StatusText event={event} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {visible.map((event) => (
                <article key={event.id} className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      {event.linkTicker === false ? (
                        <span className="font-bold text-gray-900">{event.ticker}</span>
                      ) : (
                        <Link href={`/ticker/${event.ticker}`} className="font-bold text-gray-900 hover:text-green-700">
                          {event.ticker}
                        </Link>
                      )}
                      {event.name && <p className="text-xs text-gray-500">{event.name}</p>}
                    </div>
                    <EventBadge event={event} />
                  </div>
                  <p className="text-sm font-medium text-gray-900">{formatEventDate(event.eventDate)}</p>
                  <p className="text-sm text-gray-700 mt-1">{event.detail}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {event.session || 'Time not set'} · <StatusText event={event} />
                  </p>
                </article>
              ))}
            </div>
          </>
        )}

        <Footer />
      </div>
    </div>
  );
}
