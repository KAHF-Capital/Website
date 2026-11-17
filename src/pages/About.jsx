import React, { useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Header from '../components/Header';
import Footer from './Footer';
import { siteConfig } from '../../lib/site-config';

const EFFECTIVE = 'November 16, 2026';

const TOC = [
  { href: '#company', label: 'The company' },
  { href: '#service', label: 'The service' },
  { href: '#not-advice', label: 'Not investment advice' },
  { href: '#risk', label: 'Risk of loss' },
  { href: '#performance', label: 'Track record and backtests' },
  { href: '#terms', label: 'Terms of Service' },
  { href: '#billing', label: 'Subscriptions and cancellation' },
  { href: '#sms', label: 'Text messages' },
  { href: '#privacy', label: 'Privacy Policy' },
  { href: '#contact', label: 'Contact' }
];

const PAGE_META = {
  about: {
    title: 'About — KAHF Capital',
    description: 'About KAHF Capital and Kaia, plus the terms, risk disclosures, subscription terms, text-message program, and privacy policy for the service.'
  },
  terms: {
    title: 'Terms of Service — KAHF Capital',
    description: 'Terms of Service for KAHF Capital, Kaia, and the Kaia by KAHF Capital text program, including subscriptions, risk, and acceptable use.'
  },
  privacy: {
    title: 'Privacy Policy — KAHF Capital',
    description: 'Privacy Policy for KAHF Capital. What we collect, how texts and payments are handled, and the choices you have.'
  }
};

export default function About({ page = 'about' }) {
  const meta = PAGE_META[page] || PAGE_META.about;
  const monthly = siteConfig.pricing.proMonthly;
  const annual = siteConfig.pricing.proAnnual;
  const trialDays = siteConfig.trial.days;
  const company = siteConfig.legal.company;
  const email = siteConfig.supportEmail;
  const canonical = `${siteConfig.url.replace(/\/+$/, '')}${page === 'about' ? '/about' : `/${page}`}`;

  useEffect(() => {
    const id = page === 'terms' ? 'terms' : page === 'privacy' ? 'privacy' : window.location.hash.replace('#', '');
    if (!id) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [page]);

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>{meta.title}</title>
        <meta name="description" content={meta.description} />
        <link rel="canonical" href={canonical} />
      </Head>
      <Header />

      <article className="px-4 py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-green-700">{company}</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-gray-900 sm:text-5xl">About</h1>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Kaia is an AI trading assistant from KAHF Capital. She watches unusual dark pool flow, scores a tradeable read, and texts you when one clears. You decide whether to trade. The record stays public.
          </p>
          <p className="mt-4 text-[15px] leading-relaxed text-gray-700">
            The public name of the text program is Kaia by KAHF Capital. This page describes the company and sets out the terms that cover the website, the subscription, and the texts.
          </p>
          <p className="mt-3 text-sm text-gray-500">
            Effective {EFFECTIVE}. Questions:{' '}
            <a href={`mailto:${email}`} className="font-semibold text-green-700 hover:text-green-800">{email}</a>
          </p>

          {page === 'terms' && (
            <p className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm leading-relaxed text-green-900">
              These are the Terms of Service. The company description, risk disclosures, subscription terms, text-message terms, and Privacy Policy on this page are part of the agreement.
            </p>
          )}
          {page === 'privacy' && (
            <p className="mt-6 rounded-xl bg-green-50 px-4 py-3 text-sm leading-relaxed text-green-900">
              This is the Privacy Policy. It also sits with the rest of the disclosures for the site, the subscription, and the text program.
            </p>
          )}

          <div className="mt-8 space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm leading-relaxed text-gray-700">
            <p>
              <span className="font-semibold text-gray-900">Educational research.</span> {company} is not a registered investment adviser, broker-dealer, or commodity trading advisor. Nothing on the site or in a text is investment advice, a recommendation, or an offer to buy or sell any security.
            </p>
            <p>
              <span className="font-semibold text-gray-900">You can lose money.</span> Options can expire worthless. You can lose the entire premium, and some strategies can lose more than you put in.
            </p>
            <p>
              <span className="font-semibold text-gray-900">Published results are hypothetical.</span> The track record is scored from market data. It is not a live brokerage account, and it does not predict what happens next.
            </p>
          </div>

          <nav className="mt-8 rounded-2xl border border-gray-200 p-5" aria-label="On this page">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">On this page</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {TOC.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-sm font-semibold text-green-700 hover:text-green-800">{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="company" title="The company">
            <p>
              {company} publishes market research for options traders. The products are the Kaia text service, the public track record, and the research tools on this website, including dark pool reads, historical options context, and answers from the assistant.
            </p>
            <p>
              We do not open brokerage accounts, hold customer funds, place orders, or manage money. Using the service does not create an advisory, brokerage, fiduciary, or other professional relationship. You remain responsible for every order you send to your own broker.
            </p>
            <p>
              {company} is not a registered investment adviser, broker-dealer, or commodity trading advisor. Nothing on this page is a claim of any registration.
            </p>
          </Section>

          <Section id="service" title="The service">
            <p>
              Kaia looks at off-exchange prints and scores a read from rules we publish, including size, unusual volume, direction, and a walk-forward hit rate that uses only history available on the signal day. When a name clears the gates in effect that day, subscribers who have opted in can receive a text. Quiet days stay quiet. A watchlist or other delivery setting changes which texts you receive. It is not a statement that a security is suitable for you.
            </p>
            <p>
              You can also text the assistant about a ticker or ask for a backtest. Replies are generated with software, market-data tools, and a language model. They can be incomplete, delayed, or wrong. Check any figure that matters before you trade.
            </p>
            <p>
              We can change, pause, or retire features, data sources, and the gates a name has to clear. A description on the homepage is the current public description of the product. It is not a promise that every future text will meet a particular threshold, or that you will receive a minimum number of texts.
            </p>
            <p>
              The service depends on vendors, carriers, markets, and models we do not control. Data can be missing, delayed, revised, or wrong. A missed, late, or incorrect text does not obligate us to compensate you for a trade you did or did not make.
            </p>
          </Section>

          <Section id="not-advice" title="Not investment advice">
            <p>
              All content on kahfcapital.com, in Kaia’s texts, in backtests, and in the track record is general research and education. It is impersonal. It is not based on your finances, tax situation, risk tolerance, portfolio, or investment objectives, and we do not collect that information to tailor a recommendation.
            </p>
            <p>
              We will not tell you to buy, sell, or hold a security, and we do not route or place orders. A structure named in a text, such as a call, put, or straddle, describes how the read was scored. It is not a recommendation that the structure is appropriate for you, and it is not an offer or a solicitation.
            </p>
            <p>
              You are solely responsible for your decisions, including whether to trade, the contract, the size, the expiration, and the exit. Consider your own circumstances and, if you want advice, consult a registered adviser and a tax professional. Before trading options, read the{' '}
              <a href="https://www.theocc.com/company-information/documents-and-archives/options-disclosure-document" target="_blank" rel="noopener noreferrer" className="font-semibold text-green-700 hover:text-green-800">
                Characteristics and Risks of Standardized Options
              </a>{' '}
              from the Options Clearing Corporation.
            </p>
          </Section>

          <Section id="risk" title="Risk of loss">
            <p>
              Trading securities and options involves substantial risk of loss and is not appropriate for every person. Options are wasting assets. A long option can expire worthless, and you can lose the entire premium. Spreads, short options, and other strategies can lose more than the cash you posted, and assignment, gaps, and halts can make losses larger or harder to exit.
            </p>
            <p>
              Dark pool prints are not a forecast. Unusual size can have many causes, including a print that is not directional. Historical hit rates, implied volatility, and model output can point the wrong way. Past movement around a similar print does not mean the next print will behave the same way.
            </p>
            <p>
              You can lose money even when a read matches the published gates and even when a historical statistic looks favorable. Only trade with money you can afford to lose, and only with a broker you have chosen yourself.
            </p>
          </Section>

          <Section id="performance" title="Track record and backtests">
            <p>
              Performance figures on the site are hypothetical. They are produced from market data and mechanical rules. They are not the results of a live brokerage account, they are not audited customer account statements, and they are not a promise of future results. Past performance is not indicative of future results.
            </p>
            <Sub title="The public track record">
              <p>
                The track record lists reads Kaia texts, scored from dark pool signals and marked to the options market. Open positions are marked to market. Settled calls and puts show realized intrinsic value at expiration and assume the position was held to expiry. At-the-money straddles follow a mechanical exit: the first daily close beyond a gain of 40 percent or a loss of 30 percent. The live log, including losses and open marks, is on the{' '}
                <Link href="/wins" className="font-semibold text-green-700 hover:text-green-800">track record</Link>.
              </p>
              <p>
                Highlights labeled as top reads are selected examples. They are not the full set of signals, and they are not representative of every read.
              </p>
            </Sub>
            <Sub title="Backtests you request">
              <p>
                A backtest Kaia runs for you is hypothetical. Unless a specific result says otherwise, it assumes entry at the quoted premium, does not charge commissions or slippage, and holds the position to expiration. A result with a small sample, including samples under 30 trades, is a weak basis for a conclusion. Hypothetical results have inherent limits: they can overstate what live trading would have produced once spreads, fills, fees, corporate actions, and missing quotes are included.
              </p>
            </Sub>
            <Sub title="Other limits">
              <p>
                Results can change if a vendor revises a print or a quote, if an option mark was stale or illiquid, or if we correct a calculation. We may restate history when that happens. Hypothetical performance also benefits from hindsight in the design of the rules, even where each individual score uses only information that existed on the signal day.
              </p>
            </Sub>
          </Section>

          <Section id="terms" title="Terms of Service">
            <p>
              These terms are an agreement between you and {company} (“KAHF,” “we,” “us”). They cover kahfcapital.com, Kaia, the track record, related tools, and the Kaia by KAHF Capital text program (the “service”). The subscription terms, text-message terms, and Privacy Policy below are part of this agreement.
            </p>
            <p>
              By creating an account, starting checkout, checking the text-message consent, or using the service, you agree to these terms. If you do not agree, do not use the service.
            </p>
            <Sub title="Who may use the service">
              <p>
                You must be at least 18 years old and able to form a binding contract. The service is for adults. We do not knowingly offer it to anyone under 18.
              </p>
              <p>
                You represent that you are not barred from using the service under the laws that apply to you, including U.S. sanctions, and that you will not use it from a jurisdiction where receiving this research would be unlawful.
              </p>
            </Sub>
            <Sub title="Accounts">
              <p>
                You are responsible for your login, for keeping your password confidential, and for activity under your account. Sign in with an email you control. If you verify a phone number, it must be a number you control. Tell us promptly at {email} if you believe the account or the number has been compromised.
              </p>
              <p>
                Give accurate account information. We may refuse, reclaim, or close an account that is duplicated, misleading, or used in a way these terms do not allow.
              </p>
            </Sub>
            <Sub title="Acceptable use">
              <p>You agree that you will not:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Use the service to violate the law, including securities laws and rules against manipulation, fraud, and insider trading.</li>
                <li>Share your login, resell access, or present the service as your own product.</li>
                <li>Copy, scrape, or republish the texts, the track record, or the underlying data feed to build or feed a competing product.</li>
                <li>Probe, disrupt, overload, or attempt to gain unauthorized access to the service or another person’s account.</li>
                <li>Submit a phone number, email, or other personal data you are not allowed to use.</li>
                <li>Rely on the service to route orders, meet a margin call, or do anything that requires a broker or an adviser.</li>
                <li>Reverse engineer the service except to the extent the law expressly allows.</li>
              </ul>
              <p>
                We may investigate misuse and suspend or end access, including access that has already been paid for, when we reasonably believe these rules have been broken or that continuing the service would create legal, security, or fraud risk.
              </p>
            </Sub>
            <Sub title="Your messages">
              <p>
                You keep ownership of the messages you send. You grant us a non-exclusive license to host, process, store, and display those messages, and to send them to the vendors named in the Privacy Policy, solely to operate, secure, and improve the service. That includes sending a conversation to a model provider so Kaia can reply.
              </p>
              <p>
                Do not send us confidential information about other people, or material you do not have the right to share.
              </p>
            </Sub>
            <Sub title="Our intellectual property">
              <p>
                The site, the software, the Kaia name, the way reads are presented, and our compilation of the track record belong to {company} or its licensors. We grant you a personal, limited, non-exclusive, non-transferable, revocable license to use the service for your own research. Market data remains subject to the rights of the data vendors. You may not remove proprietary notices or use our names in a way that implies a partnership, endorsement, or registration we do not have.
              </p>
              <p>
                If you send us feedback, we may use it without obligation to you.
              </p>
            </Sub>
            <Sub title="Third-party services">
              <p>
                Checkout and the billing portal are operated by Stripe. Your carrier delivers texts. Brokers, data vendors, and model providers have their own terms. We are not responsible for those services. A link on the site does not mean we endorse the destination.
              </p>
            </Sub>
            <Sub title="Disclaimers">
              <p className="rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm font-semibold uppercase leading-relaxed text-gray-800">
                The service is provided “as is” and “as available.” To the maximum extent the law allows, {company} disclaims all warranties, express or implied, including merchantability, fitness for a particular purpose, accuracy, quiet enjoyment, and non-infringement. We do not warrant that the service will be uninterrupted, timely, or error-free, that data or model output will be correct, or that any read will be profitable.
              </p>
              <p>
                Some jurisdictions do not allow certain warranty disclaimers. In those places, the disclaimers apply to the fullest extent the law permits.
              </p>
            </Sub>
            <Sub title="Limitation of liability">
              <p className="rounded-xl border border-gray-300 bg-gray-50 p-4 text-sm font-semibold uppercase leading-relaxed text-gray-800">
                To the maximum extent the law allows, {company} and its members, employees, and suppliers will not be liable for any indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, lost data, or trading losses, whether or not we knew the loss was possible. Our total liability for any claim relating to the service is limited to the greater of the fees you paid us for the service in the 12 months before the claim or one hundred U.S. dollars.
              </p>
              <p>
                This limit does not apply to liability that cannot be limited under the law that governs the claim, including liability for fraud or willful misconduct where a limit is prohibited. Your trading losses are yours.
              </p>
            </Sub>
            <Sub title="Indemnity">
              <p>
                You will indemnify and hold harmless {company} and its members, employees, and suppliers from claims, damages, losses, and reasonable legal expenses arising out of your use of the service, your trading, your content, or your breach of these terms. We will give you prompt notice of a claim we expect you to cover, and you will not settle it in a way that admits fault on our behalf without our consent.
              </p>
            </Sub>
            <Sub title="Ending the service">
              <p>
                You may stop using the service at any time and may cancel a subscription as described in the subscription terms. We may suspend or end the service, or your access to it, if you breach these terms, if a payment fails, if a vendor we depend on stops, or if we discontinue the product. Sections that by their nature should survive, including intellectual property, disclaimers, limitation of liability, indemnity, and disputes, survive the end of the agreement.
              </p>
            </Sub>
            <Sub title="Disputes">
              <p>
                Email {email} and describe the dispute before you file a claim. We will try to resolve it within 30 days. If we cannot, the dispute will be resolved in the state or federal courts located in the state where {company} is organized, and you consent to personal jurisdiction and venue there. The laws of the United States and of that state govern these terms, without regard to conflict-of-law rules. The prevailing party is not entitled to fees except where a statute says otherwise.
              </p>
            </Sub>
            <Sub title="Other terms">
              <p>
                We may update these terms by posting a new version on this page with a new effective date. If you keep using the service after that date, the new terms apply. Where the law requires express consent, including a material change to the text-message program, we will ask for it before relying on the new language. If a Stripe checkout term conflicts with this page on how a charge is processed, Stripe’s term controls that charge. If the text-message checkbox conflicts with this page, the checkbox you agreed to controls your texts until you agree to a newer consent.
              </p>
              <p>
                If a provision is held unenforceable, the rest remains in effect. A delay in enforcing a right is not a waiver. You may not assign this agreement. We may assign it in connection with a reorganization or sale of the business. These terms, together with the checkout terms presented for your purchase and the text consent you give, are the entire agreement between you and us about the service. Notices to you may be sent to the email on your account, and you agree to receive those notices electronically.
              </p>
              <p>
                We are not liable for a failure caused by events outside our reasonable control, including outages at a carrier, data vendor, model provider, or host, and including exchange halts and market closures.
              </p>
            </Sub>
          </Section>

          <Section id="billing" title="Subscriptions and cancellation">
            <p>
              Kaia Pro is a subscription. A card is required to start the {trialDays}-day free trial. During the trial you can use the paid features. If you cancel before the trial ends, the paid plan does not start and the subscription price is not charged. If you do not cancel, the trial converts to the plan you chose and that card is charged.
            </p>
            <Sub title="Price and renewal">
              <p>
                The monthly plan is ${monthly.price} per month. The annual plan is ${annual.annualTotal} per year, shown on the pricing page as ${annual.price} per month. After the trial, the plan renews automatically for the same term, at the then-current price, until you cancel. Monthly renews each month. Annual renews each year.
              </p>
              <p>
                Taxes may be added where the law requires them. A promotional or referral price lasts only for the period stated at checkout. We may change the price or the plans. The new price applies at the next renewal after we post it here or email the address on your account. Cancel before that renewal if you do not want the new price.
              </p>
            </Sub>
            <Sub title="How to cancel">
              <p>
                Cancel in the{' '}
                <a href={siteConfig.manageBillingUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-green-700 hover:text-green-800">
                  billing portal
                </a>
                . Signed-in users can also open it from Account and from Manage Subscription in the header. Cancellation takes effect at the end of the current paid period. You keep access through that date. Cancelling during the trial, before it ends, means the paid plan never starts.
              </p>
              <p>
                Except where the law requires a refund, fees already charged are not refunded and are not prorated because you stopped using the service or cancelled partway through a paid period. If a charge is a billing error, email {email} and we will review it.
              </p>
            </Sub>
            <Sub title="Failed payments">
              <p>
                If a renewal charge fails, Stripe may retry it. We may suspend paid access until the charge succeeds. You can update the card in the billing portal. We do not store your full card number. Stripe processes payments.
              </p>
            </Sub>
          </Section>

          <Section id="sms" title="Text messages">
            <p>
              Program name: Kaia by KAHF Capital. The program sends recurring automated text messages, by SMS or iMessage, about unusual dark pool activity, replies to questions you text, backtest updates, verification codes, and service notices such as help and opt-out confirmations.
            </p>
            <Sub title="Consent">
              <p>
                We send recurring program texts only after you verify a number you control and check the consent box, or after you text START to opt back in. The current consent reads: “By checking this box, I agree to receive recurring automated text messages (iMessage or SMS) from Kaia by KAHF Capital at the number above, including dark pool alerts and replies to my questions. Consent is not a condition of purchase. Message frequency varies. Msg &amp; data rates may apply. Reply HELP for help or STOP to cancel at any time.”
              </p>
              <p>
                Consent to texts is not a condition of buying a subscription. You may pay for Pro and use the website without opting in. Delivery of the texts themselves requires that separate consent. We store the consent wording, the version, the time, and the IP address and browser used when you agreed, so we can show what you accepted.
              </p>
              <p>
                Checking the box is your electronic signature for the text program. Do not verify a number that belongs to someone else.
              </p>
            </Sub>
            <Sub title="Frequency, cost, and help">
              <p>
                Message frequency varies. Some market days produce no alert. You may receive several messages on a day you text Kaia, when more than one read clears, or when a backtest finishes. We do not send unrelated marketing blasts.
              </p>
              <p>
                Message and data rates may apply. {company} does not add a per-text fee on top of the subscription. Your carrier may charge you under your own plan. Reply HELP for help, or email {email}. A HELP reply identifies the program, the support address, and how to pause or stop.
              </p>
            </Sub>
            <Sub title="How to stop">
              <p>
                Reply STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, or QUIT to opt out. You will receive one confirmation, and then no further program texts. Reply START or UNSTOP to opt back in. Reply PAUSE to mute alerts for 24 hours, and RESUME to turn them back on. You can also turn texts off from your account on the website. Opting out of texts does not by itself cancel a paid subscription. Cancel the subscription in the billing portal.
              </p>
              <p>
                Carriers are not liable for delayed or undelivered messages. Delivery depends on your carrier, device, and the messaging provider, and it can fail or arrive out of order.
              </p>
              <p>
                Mobile numbers and text opt-in data are used to run this program. We do not sell them, and we do not share them with third parties for those parties’ own marketing.
              </p>
            </Sub>
          </Section>

          <Section id="privacy" title="Privacy Policy">
            <p>
              This policy describes how {company} handles personal information when you use the site, create an account, subscribe, or text Kaia. By using the service, you agree to this policy.
            </p>
            <Sub title="Information we collect">
              <ul className="list-disc space-y-2 pl-5">
                <li>Account data: name, email address, and authentication records. Passwords are handled by our authentication provider and are not stored by us in plain text. If you use Google sign-in, we receive the basic profile Google shares for that sign-in.</li>
                <li>Billing data: Stripe customer and subscription identifiers, plan, status, and the email used at checkout. Stripe collects your card details. We do not store the full card number.</li>
                <li>Phone and consent: the mobile number you verify, stored in encrypted form, plus verification state, opt-out or pause status, and the consent text, version, time, IP address, and user agent.</li>
                <li>Messages and preferences: texts you send and we send, web chat, watchlists, alert settings, and backtest requests and results.</li>
                <li>Usage and device data: pages viewed, product events, referral codes, IP address, browser type, and approximate location inferred from the IP address. If product analytics are enabled, PostHog receives those usage events.</li>
                <li>Support mail you send to {email}.</li>
              </ul>
              <p>
                We do not ask for your brokerage login, your tax return, or a statement of your net worth, and you should not send those to us.
              </p>
            </Sub>
            <Sub title="How we use it">
              <p>We use personal information to:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Create and secure your account, take payment, and provide the features you request.</li>
                <li>Send texts you consented to, including alerts, replies, verification codes, and STOP or HELP messages.</li>
                <li>Remember preferences you set, such as a watchlist or quiet hours, so delivery matches those settings.</li>
                <li>Detect abuse, debug outages, and keep consent and opt-out records.</li>
                <li>Understand which parts of the product are used, and communicate about the service, including billing and changes to these terms.</li>
                <li>Comply with law and respond to lawful requests.</li>
              </ul>
              <p>
                We do not sell personal information. We do not share it for cross-context behavioral advertising. We do not use mobile numbers or SMS consent data for third-party marketing.
              </p>
            </Sub>
            <Sub title="Who we share it with">
              <p>We share information with service providers that process it for us:</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Google Firebase, for authentication and stored account and profile records.</li>
                <li>Stripe, for checkout, renewals, invoices, and the billing portal.</li>
                <li>Sendblue and Twilio, for delivery of SMS and iMessage. The provider that is enabled for the program receives the destination number and the message content.</li>
                <li>Anthropic, to generate Kaia’s replies from the conversation and the tool results needed to answer you.</li>
                <li>PostHog, for product analytics when that tool is enabled.</li>
                <li>Vercel, which hosts the site and processes request logs.</li>
                <li>Market-data vendors that supply equity, options, and off-exchange print data used to build reads and backtests. Those requests are about securities, not about your identity, except where a vendor’s own logs record a technical request.</li>
              </ul>
              <p>
                We may also share information if the law requires it, to protect the rights and safety of our users and the service, or as part of a merger or sale of the business. A buyer would have to honor this policy for the information it receives, or ask for your consent where the law requires it.
              </p>
            </Sub>
            <Sub title="Cookies">
              <p>
                We use cookies and similar storage for the sign-in session, for a referral code (stored for about 90 days if you arrive with a referral link), and, when analytics are enabled, for PostHog. Stripe sets its own cookies on the checkout and billing pages. You can control cookies in your browser. Blocking the session cookie will keep you from staying signed in.
              </p>
            </Sub>
            <Sub title="Retention">
              <p>
                We keep account information while the account is open and for a period afterward to complete billing, resolve disputes, and meet legal duties. Message records are kept for up to seven years, and longer if the law requires. Consent records and opt-out records are kept so we can prove what you agreed to and so a STOP request continues to be honored. Payment records are kept as accounting and tax rules require. When retention ends, we delete or de-identify the information.
              </p>
            </Sub>
            <Sub title="Your choices">
              <ul className="list-disc space-y-2 pl-5">
                <li>Reply STOP to end texts. That opt-out is stored so the number is not messaged again unless you text START.</li>
                <li>Update preferences and review the account from the account page while signed in.</li>
                <li>Cancel the subscription in the billing portal. Cancellation does not erase historical records by itself.</li>
                <li>Email {email} to request access, correction, or deletion of personal information. We will verify the request. We may decline or limit a request where the law allows, including when we need the information for security, fraud prevention, a legal claim, or a required record. Deleting an account does not cancel an active Stripe subscription. Cancel that separately so a renewal is not charged.</li>
              </ul>
              <p>
                If you are a California resident, you may request to know, delete, and correct personal information, and you may appeal a denial by replying to our response. We do not sell or share personal information as those terms are used in the California Consumer Privacy Act. We do not discriminate against you for exercising these rights. We do not knowingly respond to browser-based opt-out preference signals because we do not sell or share information those signals cover.
              </p>
              <p>
                If you are in the European Economic Area or the United Kingdom, you may request access, correction, deletion, or restriction, and you may object to processing based on our legitimate interests. We process account and subscription data to perform the contract with you, text-message data on the consent you give, and security, fraud-prevention, and product-improvement data on our legitimate interests. You may lodge a complaint with your local authority. The information is processed in the United States, which may not provide the same legal protections as your country.
              </p>
            </Sub>
            <Sub title="Security and children">
              <p>
                We use HTTPS in transit, encrypt phone numbers at rest, and limit access to production systems. No method of storage or transmission is completely secure. Use a unique password and tell us if you suspect unauthorized access.
              </p>
              <p>
                The service is not directed to children. We do not knowingly collect personal information from anyone under 18. If you believe we have, email {email} and we will delete it.
              </p>
            </Sub>
            <Sub title="Changes">
              <p>
                We will post changes on this page and update the effective date. If a change materially reduces your rights, we will provide additional notice, such as an email to the address on your account, where the law or the nature of the change calls for it.
              </p>
            </Sub>
          </Section>

          <Section id="contact" title="Contact">
            <p>
              {company}
              <br />
              <a href={`mailto:${email}`} className="font-semibold text-green-700 hover:text-green-800">{email}</a>
            </p>
            <p>
              Use that address for support, privacy requests, billing questions, and legal notices. For texts, reply HELP, or reply STOP to opt out.
            </p>
            <p>
              <Link href="/pricing" className="font-semibold text-green-700 hover:text-green-800">Pricing</Link>
              {' · '}
              <Link href="/wins" className="font-semibold text-green-700 hover:text-green-800">Track record</Link>
              {' · '}
              <Link href="/kimi" className="font-semibold text-green-700 hover:text-green-800">Kaia</Link>
            </p>
            <p className="text-sm text-gray-500">Effective {EFFECTIVE}.</p>
          </Section>
        </div>
      </article>

      <Footer />
    </div>
  );
}

function Section({ id, title, children }) {
  return (
    <section id={id} className="mt-10 scroll-mt-24 border-t border-gray-200 pt-10">
      <h2 className="text-2xl font-bold tracking-tight text-gray-900">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-gray-700">{children}</div>
    </section>
  );
}

function Sub({ title, children }) {
  return (
    <div className="pt-2">
      <h3 className="text-base font-semibold text-gray-900">{title}</h3>
      <div className="mt-2 space-y-3">{children}</div>
    </div>
  );
}
