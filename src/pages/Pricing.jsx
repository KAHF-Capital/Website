import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Check, X, Bot, Zap, Sparkles, ShieldCheck, ArrowRight } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { siteConfig, buildCheckoutUrl } from '../../lib/site-config';
import { track, readReferralCookie } from '../../lib/analytics';
import { useAuth } from '../context/AuthContext';

const FEATURE_MATRIX = [
  { label: 'Today\'s dark pool scanner', free: true, pro: true },
  { label: 'KAHF AI (5 messages / month)', free: true, pro: true },
  { label: 'Unlimited KAHF AI chat', free: false, pro: true },
  { label: 'Full scanner history', free: false, pro: true },
  { label: 'Daily email alerts (unusual dark pool activity)', free: false, pro: true }
];

export default function Pricing() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('annual'); // 'monthly' | 'annual'
  const [refCode, setRefCode] = useState(null);

  useEffect(() => {
    setRefCode(readReferralCookie());
    track('pricing_page_viewed');
  }, []);

  const monthly = siteConfig.pricing.proMonthly;
  const annual = siteConfig.pricing.proAnnual;
  const activePlan = period === 'annual' ? annual : monthly;

  const checkoutUrl = buildCheckoutUrl(activePlan.checkoutUrl, {
    email: user?.email,
    uid: user?.uid,
    refCode,
    utmSource: 'pricing',
    utmCampaign: period
  });

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>Pricing — KAHF AI | KAHF Capital</title>
        <meta name="description" content="Start a 7-day free trial of KAHF AI. Cancel anytime, 14-day money-back guarantee. From $27/mo." />
      </Head>
      <Header />

      <section className="py-12 px-4 bg-gradient-to-b from-green-50/40 via-white to-white">
        <div className="max-w-6xl mx-auto text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-semibold mb-5">
            <ShieldCheck className="h-3.5 w-3.5" />
            7-day free trial · {siteConfig.guarantee.label} · Cancel anytime
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-gray-900 mb-4 tracking-tight">
            Simple pricing. Real edge.
          </h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            One subscription. Unlimited KAHF AI, full scanner history, and daily email digests when dark pool activity is unusual.
          </p>

          {/* Billing toggle */}
          <div className="inline-flex items-center bg-gray-100 rounded-full p-1 mt-7 text-sm">
            <button
              onClick={() => { setPeriod('monthly'); track('pricing_toggle', { period: 'monthly' }); }}
              className={`px-5 py-2 rounded-full font-semibold transition-colors ${period === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => { setPeriod('annual'); track('pricing_toggle', { period: 'annual' }); }}
              className={`px-5 py-2 rounded-full font-semibold transition-colors flex items-center gap-2 ${period === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Annual
              <span className="text-[10px] uppercase font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Save 30%</span>
            </button>
          </div>
        </div>

        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-5 mb-10">
          {/* Free */}
          <div className="bg-white border border-gray-200 rounded-2xl p-7 flex flex-col">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Free</h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-4xl font-black text-gray-900">$0</span>
                <span className="text-gray-500">/forever</span>
              </div>
              <p className="text-sm text-gray-600 mb-6">For curious traders. No credit card.</p>
            </div>
            <ul className="space-y-2.5 text-sm mb-6">
              <Feature ok>Today's dark pool scanner</Feature>
              <Feature ok>Volatility calculator</Feature>
              <Feature ok>5 KAHF AI messages / month</Feature>
              <Feature>Scanner history</Feature>
              <Feature>Unlimited AI chat</Feature>
              <Feature>Daily email alerts (unusual activity)</Feature>
            </ul>
            <Link href="/signup" className="mt-auto">
              <button className="w-full border border-gray-300 hover:border-gray-400 text-gray-900 font-semibold px-6 py-3 rounded-lg transition-colors">
                Create free account
              </button>
            </Link>
          </div>

          {/* Pro - the recommended plan */}
          <div className="relative bg-gray-900 text-white rounded-2xl p-7 flex flex-col shadow-2xl shadow-green-600/10 ring-2 ring-green-500">
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[10px] uppercase font-bold tracking-wider px-3 py-1 rounded-full">
              Most popular
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-green-300 mb-2 flex items-center gap-1.5">
                <Sparkles className="h-3 w-3" /> Pro
              </h3>
              <div className="flex items-baseline gap-1 mb-1">
                <span className="text-5xl font-black">${activePlan.price}</span>
                <span className="text-gray-300">/{activePlan.period}</span>
              </div>
              {period === 'annual' ? (
                <p className="text-sm text-gray-300 mb-6">
                  ${annual.annualTotal}/yr billed annually. Save ${(monthly.price * 12) - annual.annualTotal}/yr.
                </p>
              ) : (
                <p className="text-sm text-gray-300 mb-6">Billed monthly. Cancel anytime.</p>
              )}
            </div>
            <ul className="space-y-2.5 text-sm mb-6">
              <Feature ok dark>Unlimited KAHF AI chat</Feature>
              <Feature ok dark>Full scanner history</Feature>
              <Feature ok dark>Daily email alerts on unusual dark pool activity</Feature>
            </ul>
            <a
              href={checkoutUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track('pricing_cta_clicked', { plan: 'pro', period, signedIn: !!user })}
              className="mt-auto"
            >
              <button className="w-full bg-green-500 hover:bg-green-400 text-white font-bold px-6 py-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                Start 7-day free trial
                <ArrowRight className="h-4 w-4" />
              </button>
            </a>
            <p className="text-center text-xs text-gray-400 mt-3">
              {user
                ? `Signed in as ${user.email} · Pro unlocks automatically after checkout`
                : (
                  <>
                    <Link href="/login?redirect=/pricing" className="text-green-300 hover:text-green-200 underline underline-offset-2">
                      Sign in first
                    </Link>
                    {' '}for the smoothest unlock · {siteConfig.guarantee.label}
                  </>
                )}
            </p>
          </div>
        </div>

        {/* Comparison table */}
        <div className="max-w-4xl mx-auto mt-16">
          <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">Compare side by side</h2>
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            <div className="grid grid-cols-3 px-6 py-4 bg-gray-50 border-b border-gray-200 text-sm font-semibold text-gray-600">
              <div>Feature</div>
              <div className="text-center">Free</div>
              <div className="text-center text-green-700">Pro</div>
            </div>
            {FEATURE_MATRIX.map((row, i) => (
              <div key={i} className={`grid grid-cols-3 px-6 py-3.5 text-sm ${i % 2 === 1 ? 'bg-gray-50/50' : ''}`}>
                <div className="text-gray-900">{row.label}</div>
                <div className="text-center">{row.free ? <Check className="h-5 w-5 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-gray-300 mx-auto" />}</div>
                <div className="text-center">{row.pro ? <Check className="h-5 w-5 text-green-600 mx-auto" /> : <X className="h-4 w-4 text-gray-300 mx-auto" />}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Guarantee strip */}
      <section className="py-12 px-4 bg-gray-50">
        <div className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
          <Guarantee icon={ShieldCheck} title="14-day refund" body="Don't love it? Email us within 14 days for a full refund. No questions." />
          <Guarantee icon={Zap} title="Cancel any time" body="One click in the billing portal. No retention dance, no calls." />
          <Guarantee icon={Bot} title="Built for traders" body="No fluff features. Every line ships because traders asked for it." />
        </div>
      </section>

      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-3">Have a question?</h2>
          <p className="text-gray-600 mb-6">Email us — a real human writes back, usually within an hour.</p>
          <a href={`mailto:${siteConfig.supportEmail}`} className="inline-flex items-center gap-2 text-green-700 hover:text-green-800 font-semibold">
            {siteConfig.supportEmail} <ArrowRight className="h-4 w-4" />
          </a>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Feature({ children, ok = false, dark = false }) {
  const okColor = dark ? 'text-green-400' : 'text-green-600';
  const noColor = dark ? 'text-gray-600' : 'text-gray-300';
  const txtColor = dark ? (ok ? 'text-gray-100' : 'text-gray-500') : (ok ? 'text-gray-900' : 'text-gray-400 line-through');
  return (
    <li className={`flex items-start gap-2 ${txtColor}`}>
      {ok ? <Check className={`h-4 w-4 mt-0.5 flex-shrink-0 ${okColor}`} /> : <X className={`h-4 w-4 mt-0.5 flex-shrink-0 ${noColor}`} />}
      <span>{children}</span>
    </li>
  );
}

function Guarantee({ icon: Icon, title, body }) {
  return (
    <div>
      <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center mx-auto mb-3">
        <Icon className="h-6 w-6 text-green-600" />
      </div>
      <h3 className="font-bold text-gray-900 mb-1">{title}</h3>
      <p className="text-sm text-gray-600">{body}</p>
    </div>
  );
}
