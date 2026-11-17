import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { Check, ShieldCheck, ArrowRight, Phone, MessageCircle } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { siteConfig, buildCheckoutUrl } from '../../lib/site-config';
import { track, readReferralCookie } from '../../lib/analytics';
import { useAuth } from '../context/AuthContext';

const INCLUDED = [
  'A text when a name clears every gate',
  'The ticker, the size, and the read in plain language',
  'You decide whether to trade',
  'Her public track record, wins and losses included'
];

const STEPS = [
  { n: '1', title: 'Start the trial', body: 'Checkout takes about a minute. A card starts the 7 days.' },
  { n: '2', title: 'Connect your phone', body: 'Sign in with the same email, then verify your number.' },
  { n: '3', title: 'She texts you', body: 'Kaia writes when a tradeable read clears. Quiet days stay quiet.' }
];

export default function Pricing() {
  const { user } = useAuth();
  const [period, setPeriod] = useState('annual');
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
        <title>Pricing — Kaia by KAHF Capital</title>
        <meta
          name="description"
          content="Start a 7-day free trial of Kaia. She texts you when a tradeable read clears. Cancel anytime. From $27/mo."
        />
      </Head>
      <Header />

      <section className="px-4 py-12 bg-gradient-to-b from-green-50/70 via-white to-white sm:py-16">
        <div className="mx-auto max-w-xl text-center">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
            <ShieldCheck className="h-3.5 w-3.5" />
            7-day free trial · Cancel anytime
          </div>
          <h1 className="text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">
            Get Kaia’s texts
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            One subscription. She texts you when a tradeable read clears, and the record stays public.
          </p>

          <div className="mt-7 inline-flex items-center rounded-full bg-gray-100 p-1 text-sm">
            <button
              onClick={() => { setPeriod('monthly'); track('pricing_toggle', { period: 'monthly' }); }}
              className={`rounded-full px-5 py-2 font-semibold transition-colors ${period === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Monthly
            </button>
            <button
              onClick={() => { setPeriod('annual'); track('pricing_toggle', { period: 'annual' }); }}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-colors ${period === 'annual' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
            >
              Annual
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700">Save {annual.savingsPct}%</span>
            </button>
          </div>
        </div>

        <div className="relative mx-auto mt-8 max-w-md rounded-2xl bg-gray-900 p-7 text-white shadow-2xl shadow-green-600/10 ring-2 ring-green-500">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-green-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            Kaia
          </div>
          <div className="mt-2 flex items-baseline justify-center gap-1">
            <span className="text-5xl font-black">${activePlan.price}</span>
            <span className="text-gray-300">/{activePlan.period}</span>
          </div>
          <p className="mt-2 text-center text-sm text-gray-300">
            {period === 'annual'
              ? `$${annual.annualTotal}/yr billed annually after the trial. Save $${(monthly.price * 12) - annual.annualTotal}/yr.`
              : 'Billed monthly after the trial. Switch to annual anytime.'}
          </p>

          <ul className="mt-6 space-y-2.5 text-sm">
            {INCLUDED.map((item) => (
              <li key={item} className="flex items-start gap-2 text-gray-100">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          <a
            href={checkoutUrl}
            onClick={() => track('pricing_cta_clicked', { plan: 'pro', period, signedIn: !!user })}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-lg bg-green-500 px-6 py-4 text-base font-bold text-white transition-colors hover:bg-green-400"
          >
            Start 7-day free trial
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="mt-3 text-center text-xs leading-relaxed text-gray-400">
            {user
              ? `Checkout is tied to ${user.email}. After payment you’ll connect your phone.`
              : 'No account needed to start. Use the same email afterward so Pro unlocks on your phone.'}
          </p>
          <p className="mt-2 text-center text-xs leading-relaxed text-gray-400">
            After the {siteConfig.trial.days}-day trial, this plan renews automatically at{' '}
            {period === 'annual' ? `$${annual.annualTotal}/year` : `$${monthly.price}/month`} until you cancel.
            Cancel in the{' '}
            <a href={siteConfig.manageBillingUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-white">
              billing portal
            </a>{' '}
            before the trial ends and the paid plan never starts.{' '}
            <Link href="/about#billing" className="underline hover:text-white">Subscription terms</Link>
            {' · '}
            <Link href="/about#terms" className="underline hover:text-white">Terms</Link>
          </p>
        </div>

        <ol className="mx-auto mt-12 grid max-w-3xl gap-4 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-2xl border border-gray-200 bg-white p-5 text-left">
              <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-700">
                {step.n}
              </div>
              <p className="font-semibold text-gray-900">{step.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-gray-600">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-4 py-14">
        <div className="mx-auto grid max-w-3xl gap-8 text-center sm:grid-cols-3">
          <Aside icon={ShieldCheck} title="Cancel anytime" body="Stop in the billing portal before the trial ends and the paid plan never starts." />
          <Aside icon={Phone} title="One number" body="Kaia texts the phone you verify. Reply STOP and the texts end." />
          <Aside icon={MessageCircle} title="Plain language" body="Each text is a read, not a recommendation. The trade stays yours." />
        </div>
        <p className="mx-auto mt-10 max-w-xl text-center text-sm text-gray-600">
          Want the receipts first?{' '}
          <Link href="/wins" className="font-semibold text-green-700 hover:text-green-800">
            Read Kaia’s track record
          </Link>
          , including the losses.
        </p>
      </section>

      <section className="bg-gray-50 px-4 py-14">
        <div className="mx-auto max-w-2xl">
          <h2 className="mb-6 text-center text-2xl font-bold text-gray-900">Before you start</h2>
          <div className="space-y-3">
            <Faq q="When does the first text arrive?">
              After you connect your phone. Kaia writes when a name clears every gate that day. If nothing clears, she stays quiet.
            </Faq>
            <Faq q="Do I need an account before checkout?">
              No. Pay first, then sign in with that email. Pro attaches to the account and you connect your phone from there.
            </Faq>
            <Faq q="What happens when the trial ends?">
              {period === 'annual'
                ? `The annual plan continues at $${annual.annualTotal}/year unless you cancel.`
                : `The monthly plan continues at $${monthly.price}/month unless you cancel.`}
              {' '}You can switch plans in the billing portal.
            </Faq>
          </div>
          <p className="mt-8 text-center text-sm text-gray-600">
            Questions?{' '}
            <a href={`mailto:${siteConfig.supportEmail}`} className="font-semibold text-green-700 hover:text-green-800">
              {siteConfig.supportEmail}
            </a>
          </p>
        </div>
      </section>

      <Footer />
    </div>
  );
}

function Aside({ icon: Icon, title, body }) {
  return (
    <div>
      <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-gray-200 bg-white">
        <Icon className="h-5 w-5 text-green-600" />
      </div>
      <h3 className="font-bold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-gray-600">{body}</p>
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <details className="group rounded-2xl border border-gray-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center justify-between p-5 font-semibold text-gray-900">
        {q}
        <ArrowRight className="h-4 w-4 text-gray-400 transition-transform group-open:rotate-90" />
      </summary>
      <div className="px-5 pb-5 text-sm leading-relaxed text-gray-600">{children}</div>
    </details>
  );
}
