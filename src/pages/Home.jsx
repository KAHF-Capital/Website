import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  Bot,
  Sparkles,
  ArrowRight,
  Zap,
  ShieldCheck,
  Clock,
  TrendingUp,
  BarChart3,
  Search,
  MessageSquare,
  CheckCircle2
} from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import HomeAIPreview from '../components/HomeAIPreview';
import HomeTopReads from '../components/HomeTopReads';
import { siteConfig } from '../../lib/site-config';
import { track } from '../../lib/analytics';

const HOW_IT_WORKS = [
  {
    icon: MessageSquare,
    title: 'Ask in plain English',
    body: '"Find me a high-conviction trade." "Score the scanner." "What\'s the best play on NVDA into earnings?" KAHF AI takes it from there.'
  },
  {
    icon: BarChart3,
    title: 'AI runs the KAHF Read',
    body: 'Five factors — institutional flow, options direction (call/put), historical edge, liquidity, and whether the catalyst is already priced into IV — combine into one verdict and the structure that actually fits.'
  },
  {
    icon: Bot,
    title: 'Get a tradeable read',
    body: 'Trade, watchlist, or skip — with the receipts. Direction, strike, expiration, and the volatility sanity checks behind it. Pro includes a daily email when dark pool volume is unusually high.'
  }
];

const FEATURES = [
  { icon: Bot, title: 'KAHF AI · Volatility Analyst', body: 'Unlimited Claude-powered analyst that finds the best volatility play on any ticker — using real options data, dark pool flow, and 3 years of price history.', tag: 'Headline' },
  { icon: Search, title: 'Dark Pool Scanner', body: 'Track $250M+ institutional prints. Sorted by volume ratio, with options stats and catalyst tags.', tag: 'Free' },
  { icon: TrendingUp, title: 'Volatility Calculator', body: 'Run any ticker against ATM strikes, real Polygon premiums, and a 3-year historical hit rate. See if the move is priced fairly.', tag: 'Free' },
  { icon: Zap, title: 'Daily email digest', body: 'Pro subscribers get a daily email roundup of unusual dark pool activity — the same setups that power the scanner, in your inbox.', tag: 'Pro' },
  { icon: ShieldCheck, title: 'Track Record Page', body: 'Every flagged alert with the result, public after a 24h delay. Receipts, not promises.', tag: 'Public' },
  { icon: Clock, title: '7-Day Free Trial', body: 'Full Pro access. Cancel anytime. 14-day money-back guarantee even after.', tag: 'No risk' }
];

const FAQ = [
  {
    q: 'What is KAHF AI?',
    a: 'An AI volatility analyst built on Claude. It finds the best strategy for each setup — or tells you to stay flat — by reconciling 3 years of historical hit-rate math with the forward catalyst direction, IV regime, options liquidity, and dark pool flow. Plain English in, tradeable read out.'
  },
  {
    q: 'Is the dark pool data real?',
    a: 'Yes. We ingest off-exchange print tapes via Polygon and surface notional volume vs trailing averages. Same data the desks use, packaged for retail.'
  },
  {
    q: 'How does the free trial work?',
    a: 'Start a 7-day free trial of Pro. Full unlimited KAHF AI, full scanner history, and daily emails when dark pool activity is unusual. Cancel anytime — we also offer a 14-day money-back guarantee.'
  },
  {
    q: 'Is this financial advice?',
    a: 'No. KAHF Capital LLC is not a registered investment adviser. Everything on the site is educational. Trade at your own risk and do your own research.'
  }
];

export default function Home() {
  const proCheckout = siteConfig.pricing.proMonthly.checkoutUrl;

  const handlePrimaryCTA = () => track('home_primary_cta_clicked', { dest: '/pricing' });
  const handleSecondaryCTA = () => track('home_secondary_cta_clicked', { dest: '/kahf-ai' });

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>KAHF AI — Your personal volatility analyst | KAHF Capital</title>
        <meta
          name="description"
          content="KAHF AI is your AI volatility analyst. Find the best volatility play on any ticker using real dark pool flow and 3 years of historical hit-rate math. 7-day free trial."
        />
        <meta property="og:title" content="KAHF AI — Trade like the 1%" />
        <meta property="og:description" content="Your personal volatility analyst. Trained on a decade of institutional flow." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={siteConfig.url} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={siteConfig.url} />
      </Head>
      <Header />

      {/* Hero */}
      <section className="relative pt-12 pb-16 px-4 overflow-hidden bg-gradient-to-b from-green-50/40 via-white to-white">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold mb-5">
              <Sparkles className="h-3.5 w-3.5" />
              Powered by Claude · Built on a decade of institutional flow
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-gray-900 mb-5 leading-[1.05] tracking-tight">
              Your personal{' '}
              <span className="text-green-600">AI volatility analyst.</span>
            </h1>
            <p className="text-lg sm:text-xl text-gray-600 mb-7 max-w-2xl mx-auto leading-relaxed">
              Score any ticker against 3 years of price history, real options flow, and institutional dark pool prints in seconds.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-5">
              <Link href="/pricing" onClick={handlePrimaryCTA}>
                <button className="bg-green-600 hover:bg-green-700 text-white px-8 py-4 text-base font-semibold rounded-xl shadow-lg shadow-green-600/20 hover:shadow-green-600/30 transition-all flex items-center gap-2">
                  Start 7-day free trial
                  <ArrowRight className="h-5 w-5" />
                </button>
              </Link>
              <Link href="/kahf-ai" onClick={handleSecondaryCTA}>
                <button className="text-gray-900 hover:text-green-600 font-semibold px-6 py-4 text-base inline-flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Try the live demo →
                </button>
              </Link>
            </div>
            <p className="text-xs text-gray-500">
              No credit card to start · {siteConfig.guarantee.label} · Cancel any time
            </p>
          </div>

          {/* Live AI demo */}
          <HomeAIPreview />

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mt-12 max-w-3xl mx-auto text-center">
            <Stat label="Dark pool prints/day" value="$50B+" />
            <Stat label="Tickers tracked" value="3,000+" />
            <Stat label="Best-leg hit rate" value="55%+" />
            <Stat label="Avg AI response" value="< 6s" />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 px-4 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-2">How it works</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">From idea to tradeable read in 6 seconds.</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW_IT_WORKS.map((step, i) => (
              <div key={i} className="bg-white border border-gray-200 rounded-2xl p-7 relative">
                <div className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-green-600 text-white font-bold flex items-center justify-center shadow-md">
                  {i + 1}
                </div>
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
                  <step.icon className="h-6 w-6 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Biggest winners YTD (full track record lives on /wins) */}
      <HomeTopReads />

      {/* Features */}
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-sm font-semibold text-green-700 uppercase tracking-wider mb-2">What's inside</p>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Built around the AI. Powered by real data.</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div key={i} className="border border-gray-200 hover:border-green-300 hover:shadow-lg transition-all bg-white rounded-2xl p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="w-11 h-11 rounded-xl bg-green-100 flex items-center justify-center">
                    <f.icon className="h-5 w-5 text-green-600" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-gray-100 text-gray-600">
                    {f.tag}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 text-center mb-10">Frequently asked.</h2>
          <div className="space-y-3">
            {FAQ.map((item, i) => (
              <details key={i} className="group border border-gray-200 rounded-xl bg-white open:shadow-md transition-shadow">
                <summary className="cursor-pointer list-none p-5 flex items-center justify-between font-semibold text-gray-900">
                  {item.q}
                  <ArrowRight className="h-4 w-4 text-gray-400 group-open:rotate-90 transition-transform" />
                </summary>
                <div className="px-5 pb-5 text-gray-600 leading-relaxed">{item.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 px-4 bg-gradient-to-br from-green-600 to-emerald-700 text-white">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">Stop guessing. Start asking.</h2>
          <p className="text-green-50 text-lg mb-7 max-w-2xl mx-auto">
            7-day free trial of full KAHF AI. No credit card. {siteConfig.guarantee.label}.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/pricing" onClick={handlePrimaryCTA}>
              <button className="bg-white text-green-700 hover:bg-green-50 px-8 py-4 text-base font-bold rounded-xl shadow-xl flex items-center gap-2 mx-auto sm:mx-0">
                Start free trial <ArrowRight className="h-5 w-5" />
              </button>
            </Link>
            <Link href="/kahf-ai">
              <button className="border-2 border-white/40 hover:bg-white/10 text-white px-8 py-4 text-base font-semibold rounded-xl flex items-center gap-2 mx-auto sm:mx-0">
                <Bot className="h-5 w-5" /> Try the demo
              </button>
            </Link>
          </div>
          <div className="flex items-center justify-center gap-6 mt-7 text-green-100 text-sm">
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> Cancel anytime</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> No credit card</span>
            <span className="hidden sm:inline-flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4" /> 14-day refund</span>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="text-2xl sm:text-3xl font-black text-gray-900">{value}</div>
      <div className="text-xs sm:text-sm text-gray-500 mt-1">{label}</div>
    </div>
  );
}
