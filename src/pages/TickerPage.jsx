import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowRight, BarChart3, TrendingUp, Calendar, Sparkles, Bot } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import AskAIButton from '../components/AskAIButton';
import { siteConfig } from '../../lib/site-config';

function formatNotional(n) {
  if (!n) return '$0';
  return Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export default function TickerPage({ symbol, summary, error }) {
  const title = `$${symbol} Dark Pool Activity & Volatility Read | KAHF AI`;
  const desc = summary?.has_data
    ? `${symbol} dark pool prints over the last ${summary.lookback_days} trading days: ${formatNotional(summary.total_notional_30d)} in notional, peak volume ratio ${summary.peak?.volume_ratio?.toFixed?.(1) || '—'}×. Get an AI volatility read in seconds.`
    : `Dark pool activity and earnings straddle history for ${symbol}. Powered by KAHF AI.`;

  const canonical = `${siteConfig.url}/ticker/${symbol}`;

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>{title}</title>
        <meta name="description" content={desc} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={desc} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebPage',
              name: title,
              description: desc,
              url: canonical,
              about: { '@type': 'Thing', name: `${symbol} stock` }
            })
          }}
        />
      </Head>
      <Header />

      <section className="py-10 px-4 bg-gradient-to-b from-green-50/40 via-white to-white">
        <div className="max-w-5xl mx-auto">
          <div className="mb-6">
            <Link href="/scanner" className="text-sm text-gray-500 hover:text-green-700 inline-flex items-center gap-1">
              ← Back to scanner
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <div className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-green-700 mb-2">
                <Sparkles className="h-3 w-3" /> Live data · Updated daily
              </div>
              <h1 className="text-4xl sm:text-5xl font-black text-gray-900 tracking-tight">
                ${symbol} <span className="text-gray-500 font-bold text-2xl sm:text-3xl">dark pool activity</span>
              </h1>
              <p className="text-gray-600 mt-2 max-w-2xl">{desc}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <AskAIButton
                prompt={`Give me a volatility read on ${symbol} right now. Score it on 4-of-4 and tell me if there's a tradeable straddle.`}
                ticker={symbol}
                source={`ticker_page_${symbol}`}
                size="lg"
                variant="primary"
              >
                Ask KAHF AI about {symbol}
              </AskAIButton>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
          )}

          {!error && !summary?.has_data && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-6">
              <h3 className="font-bold text-amber-900 mb-1">No recent dark pool prints for ${symbol}</h3>
              <p className="text-amber-800 text-sm">No off-exchange institutional activity above our threshold in the last {summary?.lookback_days || 30} trading days. Try the scanner for live names.</p>
              <Link href="/scanner" className="text-sm font-semibold text-amber-900 hover:underline inline-flex items-center gap-1 mt-2">
                See active tickers <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}

          {summary?.has_data && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <Stat
                  icon={Calendar}
                  label="Most recent print"
                  value={summary.latest?.date || '—'}
                  sub={summary.latest ? `${summary.latest.volume_ratio.toFixed(1)}× ratio` : ''}
                />
                <Stat
                  icon={BarChart3}
                  label="Peak volume ratio"
                  value={summary.peak ? `${summary.peak.volume_ratio.toFixed(1)}×` : '—'}
                  sub={summary.peak?.date}
                />
                <Stat
                  icon={TrendingUp}
                  label={`${summary.lookback_days}-day notional`}
                  value={formatNotional(summary.total_notional_30d)}
                />
                <Stat
                  icon={Sparkles}
                  label="Avg volume ratio"
                  value={`${summary.avg_volume_ratio}×`}
                />
              </div>

              <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden mb-10">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Dark pool history (last {summary.history.length} sessions)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-right px-4 py-3">Vol Ratio</th>
                        <th className="text-right px-4 py-3">Notional</th>
                        <th className="text-right px-4 py-3 hidden sm:table-cell">Avg Price</th>
                        <th className="text-right px-4 py-3 hidden md:table-cell">Trades</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...summary.history].reverse().map((h, i) => (
                        <tr key={`${h.date}-${i}`} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-gray-600">{h.date}</td>
                          <td className="px-4 py-3 text-right font-mono font-semibold text-gray-900">
                            {h.volume_ratio.toFixed(1)}×
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">{formatNotional(h.total_value)}</td>
                          <td className="px-4 py-3 text-right text-gray-600 hidden sm:table-cell">${h.avg_price.toFixed(2)}</td>
                          <td className="px-4 py-3 text-right text-gray-500 hidden md:table-cell">{h.trade_count.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* Educational section (good for SEO) */}
          <div className="prose prose-gray max-w-none mb-10">
            <h2 className="text-2xl font-bold text-gray-900">What does dark pool activity on {symbol} mean?</h2>
            <p className="text-gray-700 leading-relaxed">
              Dark pools are private trading venues where institutions execute large block orders away from public exchanges. When ${symbol} prints unusually high off-exchange volume — measured as a multiple of its trailing 7-day average — it often signals that a large player is accumulating or distributing the name without moving the public bid/ask.
            </p>
            <p className="text-gray-700 leading-relaxed">
              On its own, a dark pool spike isn't a trade signal. KAHF AI scores ${symbol} against four checks before flagging anything: <strong>volume ratio</strong> (3×+), <strong>historical straddle hit rate</strong> (55%+), <strong>options liquidity</strong>, and a <strong>real catalyst</strong> (earnings, FDA, M&amp;A). Strong setups surface in Pro&apos;s daily email digest of unusual activity.
            </p>
            <h3 className="text-xl font-bold text-gray-900 mt-6">Want a volatility read on {symbol}?</h3>
            <p className="text-gray-700 leading-relaxed">
              Ask KAHF AI in plain English. <em>"Is ${symbol} worth a straddle into earnings?"</em> takes 6 seconds and gives you the same structured answer the desks would.
            </p>
          </div>

          {/* CTA */}
          <div className="bg-gradient-to-br from-green-600 to-emerald-700 text-white rounded-2xl p-8 text-center">
            <h2 className="text-2xl sm:text-3xl font-bold mb-2">Get an AI read on {symbol} now.</h2>
            <p className="text-green-50 mb-5 max-w-xl mx-auto">7-day free trial of KAHF AI. Unlimited questions. Cancel any time.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link href={`/sonnet?q=${encodeURIComponent(`Volatility read on ${symbol}`)}&t=${symbol}`}>
                <button className="bg-white text-green-700 hover:bg-green-50 font-bold px-7 py-3.5 rounded-xl inline-flex items-center gap-2 shadow-lg mx-auto sm:mx-0">
                  <Bot className="h-4 w-4" /> Ask KAHF AI now
                </button>
              </Link>
              <Link href="/pricing">
                <button className="border-2 border-white/40 hover:bg-white/10 text-white font-semibold px-6 py-3.5 rounded-xl mx-auto sm:mx-0">
                  See pricing
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-500 text-xs uppercase tracking-wider mb-2">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className="text-xl sm:text-2xl font-black text-gray-900">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}
