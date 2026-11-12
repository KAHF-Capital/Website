import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight, Check, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import GrowthChart from '../components/GrowthChart';
import HomeTopReads from '../components/HomeTopReads';
import { siteConfig } from '../../lib/site-config';
import { track } from '../../lib/analytics';

const STEPS = [
  {
    icon: Sparkles,
    title: 'She reads the tape',
    body: 'Kimmy watches off-exchange prints. She looks at notional size, the average price, and whether today’s volume is unusual versus the recent average.'
  },
  {
    icon: ShieldCheck,
    title: 'She scores the read',
    body: 'Direction comes from the close versus the average print. The hit rate is walk-forward, using only history that existed on the signal day.'
  },
  {
    icon: MessageCircle,
    title: 'She texts you',
    body: 'When a name clears every gate, you get one text in plain language. The trading decision stays with you.'
  }
];

const GATES = [
  {
    title: 'Size',
    body: 'Dark pool notional of at least $250 million, in a stock priced from $50 to $5,000.'
  },
  {
    title: 'Unusual volume',
    body: 'Volume at least 3× the prior 7-day dark pool average.'
  },
  {
    title: 'Direction',
    body: 'A close above the average print is a call. A close below is a put. An indecisive print is a straddle.'
  },
  {
    title: 'Hit rate',
    body: 'A walk-forward hit rate at about 30 days to expiration, using only history that existed on the signal day. It has to clear 50% (45% for a direction-confirmed put) and stay under 75%.'
  },
  {
    title: 'Still a live name',
    body: 'Names whose recent volatility has collapsed, the usual signature of a pinned buyout, are left off the text.'
  }
];

const FAQ = [
  {
    q: 'Who is Kimmy?',
    a: 'Kimmy is an AI trading assistant from KAHF Capital. She watches unusual dark pool flow, scores a tradeable read, and texts you when one clears. You place the trade. She keeps the record public.'
  },
  {
    q: 'When does she text?',
    a: 'When a name clears every gate on the day of the print: size, unusual volume, direction, and a walk-forward hit rate. Quiet days stay quiet.'
  },
  {
    q: 'Can I see her results before I subscribe?',
    a: 'Yes. Her track record and top trades are on this page. The full log, including losses and open marks, is on the track record page.'
  },
  {
    q: 'How does the free trial work?',
    a: 'Start a 7-day free trial of Pro. Cancel anytime.'
  },
  {
    q: 'Is this financial advice?',
    a: 'No. KAHF Capital LLC is not a registered investment adviser. Everything on the site is educational. Trade at your own risk and do your own research.'
  }
];

function fmtDate(iso) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function moneyCompact(value) {
  return Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(value);
}

function latestAlert(alerts) {
  if (!alerts?.length) return null;
  return [...alerts].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
}

function Incoming({ children }) {
  return (
    <div className="mr-8 ml-1 rounded-2xl rounded-tl-md bg-white border border-gray-200 px-3.5 py-2.5 text-sm text-gray-800 shadow-sm leading-relaxed">
      {children}
    </div>
  );
}

function KimmyText({ alert, loading }) {
  return (
    <div className="relative mx-auto w-full max-w-[340px]">
      <div className="absolute -inset-8 rounded-full bg-green-300/30 blur-3xl pointer-events-none" aria-hidden="true" />
      <div className="relative rounded-[2.4rem] bg-gray-900 p-2.5 shadow-2xl shadow-gray-900/20" aria-label="A text from Kimmy">
        <div className="overflow-hidden rounded-[1.9rem] bg-[#f6f7f4]">
          <div className="flex h-6 items-end justify-center">
            <div className="h-4 w-24 rounded-b-2xl bg-gray-900" />
          </div>
          <div className="flex items-center gap-3 px-4 pb-3 pt-3">
            <div className="relative">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">K</div>
              <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-green-400 ring-2 ring-[#f6f7f4]" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-none text-gray-900">Kimmy</div>
              <div className="mt-1 text-[11px] text-green-700">KAHF Capital</div>
            </div>
          </div>
          <div className="space-y-2.5 px-3 pb-5">
            <Incoming>Hey. I found a tradeable read.</Incoming>
            {loading ? (
              <div className="ml-1 mr-8 h-28 animate-pulse rounded-2xl border border-gray-200 bg-white" />
            ) : alert ? (
              <div className="ml-1 mr-8 rounded-2xl rounded-tl-md border border-gray-200 bg-white p-3.5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-gray-900">{alert.ticker}</span>
                  {alert.structure_label && (
                    <span className="rounded-md bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-700">
                      {alert.structure_label}
                    </span>
                  )}
                </div>
                <dl className="mt-3 space-y-1.5 text-xs text-gray-600">
                  {alert.volume_ratio > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt>Vs recent average</dt>
                      <dd className="font-semibold text-gray-900">{alert.volume_ratio.toFixed(1)}×</dd>
                    </div>
                  )}
                  {alert.total_value > 0 && (
                    <div className="flex justify-between gap-3">
                      <dt>Dark pool notional</dt>
                      <dd className="font-semibold text-gray-900">{moneyCompact(alert.total_value)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between gap-3">
                    <dt>Scored</dt>
                    <dd className="font-semibold text-gray-900">{fmtDate(alert.date)}</dd>
                  </div>
                </dl>
              </div>
            ) : (
              <div className="ml-1 mr-8 rounded-2xl rounded-tl-md border border-gray-200 bg-white p-3.5 shadow-sm">
                <p className="text-sm font-semibold text-gray-900">A name that clears every gate</p>
                <p className="mt-2 text-xs leading-relaxed text-gray-600">
                  Size, unusual volume, direction, and a walk-forward hit rate. Then the text goes out.
                </p>
              </div>
            )}
            <Incoming>The trading decision stays with you. I’ll keep watching the tape.</Incoming>
          </div>
        </div>
      </div>
      <p className="relative mt-4 text-center text-[11px] leading-relaxed text-gray-500">
        {loading
          ? 'Loading her latest read.'
          : alert
            ? `A real read Kimmy scored on ${fmtDate(alert.date)}.`
            : 'Sample of the text she sends.'}
      </p>
    </div>
  );
}

function Stat({ label, value, tone = 'default' }) {
  const color = tone === 'good' ? 'text-green-600' : tone === 'bad' ? 'text-red-500' : 'text-gray-900';
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 text-center">
      <div className={`text-2xl font-black sm:text-3xl ${color}`}>{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-gray-500">{label}</div>
    </div>
  );
}

export default function Home() {
  const [record, setRecord] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/wins')
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        if (!cancelled) setRecord(data);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => { cancelled = true; };
  }, []);

  const loading = !record && !failed;
  const alerts = record?.alerts || [];
  const summary = record?.summary;
  const featured = latestAlert(alerts);

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>Kimmy by KAHF Capital — She texts you when she finds a trade</title>
        <meta
          name="description"
          content="Kimmy is an AI trading assistant from KAHF Capital. She texts you every time she finds a tradeable read. See her public track record and top trades."
        />
        <meta property="og:title" content="Kimmy by KAHF Capital — She texts you when she finds a trade" />
        <meta property="og:description" content="Kimmy texts you every time she finds a tradeable read. Her track record and top trades are public." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteConfig.url} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={siteConfig.url} />
      </Head>
      <Header />

      <section className="relative overflow-hidden bg-gradient-to-b from-green-50/70 via-white to-white px-4 pb-8 pt-14 sm:pt-20">
        <div className="pointer-events-none absolute -left-24 top-10 h-64 w-64 rounded-full bg-green-100/80 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -right-16 top-0 h-72 w-72 rounded-full bg-emerald-100/70 blur-3xl" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-16">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              Kimmy by KAHF Capital
            </div>
            <h1 className="text-4xl font-black leading-[1.05] tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
              Meet Kimmy.
              <span className="mt-2 block text-green-600">She texts you when she finds a trade.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-gray-600">
              An AI trading assistant who watches unusual dark pool flow, scores a tradeable read, and texts you the moment one clears. Her track record and her top trades are right here.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/pricing"
                onClick={() => track('home_cta_clicked', { source: 'hero', product: 'kimmy' })}
                className="inline-flex items-center justify-center rounded-xl bg-green-600 px-7 py-3.5 text-base font-semibold text-white shadow-lg shadow-green-600/20 transition-colors hover:bg-green-700"
              >
                Get Kimmy’s texts
              </Link>
              <a
                href="#track-record"
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 px-7 py-3.5 text-base font-semibold text-gray-900 transition-colors hover:border-gray-400 hover:bg-white"
              >
                See her track record
              </a>
            </div>
            <p className="mt-4 text-sm text-gray-500">7-day free trial. Cancel anytime.</p>
          </div>
          <KimmyText alert={featured} loading={loading} />
        </div>
      </section>

      <section id="track-record" className="scroll-mt-24 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Public record</p>
              <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Kimmy’s track record</h2>
              <p className="mt-3 max-w-2xl leading-relaxed text-gray-600">
                Every scored read, marked to the live options market. The chart is a hypothetical $100,000 account putting $5,000 on each text. Wins and losses both stay on the page.
              </p>
            </div>
            <Link href="/wins" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-green-700 hover:text-green-800">
              Open the full log <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loading && (
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl border border-gray-200 bg-white" />
              ))}
            </div>
          )}

          {summary && (
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Reads" value={summary.total} />
              <Stat label="Hit rate" value={`${summary.hit_rate}%`} tone="good" />
              <Stat label="Avg winner" value={`+${summary.avg_winner}%`} tone="good" />
              <Stat label="Avg loser" value={`${summary.avg_loser}%`} tone="bad" />
            </div>
          )}

          {loading && <div className="h-72 animate-pulse rounded-2xl border border-gray-200 bg-white" />}
          {record && (
            <GrowthChart alerts={alerts} kicker="Marked to the live market" className="mb-0" />
          )}
          {failed && (
            <p className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 text-sm text-gray-600">
              Her track record is temporarily unavailable. The full log is on the{' '}
              <Link href="/wins" className="font-semibold text-green-700 hover:text-green-800">track record page</Link>.
            </p>
          )}
        </div>
      </section>

      <HomeTopReads alerts={alerts} disclaimer={record?.disclaimer || ''} loading={loading} />

      <section className="px-4">
        <div className="mx-auto max-w-3xl py-6 text-center sm:py-10">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-sm font-bold text-white">K</div>
          <blockquote className="text-2xl font-semibold leading-snug tracking-tight text-gray-900 sm:text-3xl">
            “I text when a read clears every gate.”
          </blockquote>
          <p className="mt-4 text-sm text-gray-500">Kimmy · AI trading assistant</p>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto mb-10 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">How Kimmy works</h2>
            <p className="mt-3 leading-relaxed text-gray-600">
              A dark pool is where large orders trade away from the public exchange. The size and the price hit the tape after the print. Kimmy reads that tape, then texts you.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <div key={step.title} className="rounded-2xl border border-gray-200 bg-white p-6">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-100 text-green-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">0{index + 1}</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{step.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="px-4 py-16">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">The standard</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">What counts as a tradeable read</h2>
            <p className="mt-4 leading-relaxed text-gray-600">
              Kimmy texts when a name clears every gate on the day of the print. One miss and it stays off your phone.
            </p>
          </div>
          <ul className="space-y-3">
            {GATES.map((gate) => (
              <li key={gate.title} className="flex gap-4 rounded-2xl border border-gray-200 bg-white p-5">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700">
                  <Check className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{gate.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-gray-600">{gate.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-gray-50 px-4 py-16">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-10 text-center text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">Questions, answered.</h2>
          <div className="space-y-3">
            {FAQ.map((item) => (
              <details key={item.q} className="group rounded-2xl border border-gray-200 bg-white transition-shadow open:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-gray-900">
                  {item.q}
                  <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
                </summary>
                <div className="px-5 pb-5 leading-relaxed text-gray-600">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-4 pt-4">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-gray-900 px-6 py-14 text-center sm:px-12">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(22,163,74,0.28),transparent_55%)]" aria-hidden="true" />
          <div className="relative">
            <p className="text-sm font-semibold uppercase tracking-wider text-green-300">Kimmy by KAHF Capital</p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-black tracking-tight text-white sm:text-4xl">
              She’ll text you when a tradeable read clears.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-gray-300">
              Start a 7-day free trial. Kimmy watches the tape. You get the text, and the record stays public.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/pricing"
                onClick={() => track('home_cta_clicked', { source: 'closing', product: 'kimmy' })}
                className="inline-flex items-center justify-center rounded-xl bg-green-600 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-green-500"
              >
                Start free trial
              </Link>
              <Link
                href="/wins"
                className="inline-flex items-center justify-center rounded-xl border border-white/15 px-7 py-3.5 text-base font-semibold text-white transition-colors hover:bg-white/10"
              >
                Read the full track record
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
