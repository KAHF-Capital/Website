import React, { useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertCircle, Bot, Loader2, Lock, Send, Sparkles, Zap, ArrowRight } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { useAuth } from '../context/AuthContext';
import { track } from '../../lib/analytics';

const ALL_PROMPTS = [
  'How unusual is dark pool flow on the scanner today?',
  'Run the KAHF Read on the top scanner tickers',
  'How has dark pool volume changed over the last 3 days?',
  'Upcoming earnings or FDA dates on the scanner',
  'Break down NVDA: flow, hit rates, and IV versus realized',
  'Is the move on the top signal already priced in?',
  'Which tickers are printing $1B+ dark pool volume?',
  'Where is options liquidity thin on the scanner?'
];

// Pick 4 prompts that rotate by day-of-year so the page feels alive on each visit.
function getDailyPrompts() {
  const day = Math.floor((Date.now() - new Date(new Date().getUTCFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const start = day % ALL_PROMPTS.length;
  return [0, 1, 2, 3].map(i => ALL_PROMPTS[(start + i) % ALL_PROMPTS.length]);
}

function getOrCreateSessionId() {
  if (typeof window === 'undefined') return '';
  const key = 'sonnet_session_id';
  let sessionId = window.localStorage.getItem(key);
  if (!sessionId) {
    sessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(key, sessionId);
  }
  return sessionId;
}

function MessageContent({ message }) {
  if (message.role === 'user') {
    return <span className="whitespace-pre-wrap">{message.content}</span>;
  }

  return (
    <div className="space-y-2">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h1 className="text-base font-bold text-gray-900 mt-1">{children}</h1>,
          h2: ({ children }) => <h2 className="text-base font-bold text-gray-900 mt-1">{children}</h2>,
          h3: ({ children }) => <h3 className="text-sm font-semibold text-gray-900 mt-1">{children}</h3>,
          p: ({ children }) => <p className="text-sm leading-relaxed">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 underline hover:text-green-800"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-green-200 pl-3 text-gray-700">{children}</blockquote>
          ),
          code: ({ inline, children }) => (
            inline ? (
              <code className="rounded bg-white px-1 py-0.5 text-xs text-gray-900">{children}</code>
            ) : (
              <code className="block overflow-x-auto rounded bg-gray-900 p-3 text-xs text-white">{children}</code>
            )
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>
        }}
      >
        {message.content}
      </ReactMarkdown>
    </div>
  );
}

export default function KahfAi() {
  const router = useRouter();
  const { user, loading: authLoading, hasActiveSubscription, refreshUserData } = useAuth();
  const [dailyPrompts, setDailyPrompts] = useState(ALL_PROMPTS.slice(0, 4));

  // Sample conversation shown by default — gives cold visitors immediate context
  const initialMessages = useMemo(() => ([
    {
      role: 'assistant',
      content: [
        "I'm KAHF AI. I help options traders read a setup — dark pool flow, call/put/straddle hit rates, IV versus realized, liquidity, and catalysts. I don't pick the trade.",
        '',
        'A read lines up 5 factors:',
        '- **Flow** — how unusual the dark pool volume is versus the 7-day average',
        '- **Direction** — call/put flow and where it printed versus the prior range',
        '- **Hit rates** — call, put, and straddle history at ~30 DTE, side by side',
        '- **Liquidity & cost** — open interest, spreads, premium',
        '- **Catalyst & priced-in** — whether there is a catalyst, and whether the move is already in the IV',
        '',
        'I also note skew and whether earnings sits inside the window. Ask in plain English, or tap a starter below.'
      ].join('\n')
    },
    {
      role: 'user',
      content: 'Show me a sample read so I know what to expect.'
    },
    {
      role: 'assistant',
      content: [
        '**Sample read (illustrative, not a live ticker).**',
        '',
        '**Flow:** 4.2× dark pool volume. VWAP printed above the prior close.',
        '**Direction:** call volume about 2.1× put volume.',
        '**Hit rates at ~30 DTE:** long call 64%, long put 41%, straddle 52%. Sample size is solid on all three.',
        '**Liquidity:** open interest 50k+, spreads under 0.5% of premium.',
        '**Catalyst:** earnings in 9 days. Implied move about 6% versus an 11% average realized move, so IV is not rich versus history. Skew is balanced.',
        '',
        'Call flow and the call hit rate point the same way. That is the read. What to do with it is yours.',
        '',
        '_Ask about a live ticker._'
      ].join('\n')
    }
  ]), []);

  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const [statusChecked, setStatusChecked] = useState(false);
  const bottomRef = useRef(null);
  const hasSentInitialQuery = useRef(false);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
    setDailyPrompts(getDailyPrompts());
  }, []);

  // On sign-in: sync Pro from Stripe/pending so the banner doesn't stay stuck on Free
  // after a successful payment that the webhook didn't link.
  useEffect(() => {
    if (authLoading || !user) {
      if (!authLoading && !user) setStatusChecked(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/subscription-status', {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data.usage) setUsage(data.usage);
        if (data.healed || data.isPro) {
          await refreshUserData();
        }
      } catch {
        // non-fatal — chat API will also heal on first message
      } finally {
        if (!cancelled) setStatusChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [authLoading, user?.uid]);

  // Auto-send a query passed via ?q=... (from homepage demo, scanner Ask AI, etc.)
  useEffect(() => {
    if (!router.isReady || hasSentInitialQuery.current) return;
    const q = router.query.q;
    if (q && typeof q === 'string' && q.trim()) {
      hasSentInitialQuery.current = true;
      setMessages(initialMessages);
      track('sonnet_autoquery', { source: router.query.source || 'url', length: q.length });
      setTimeout(() => sendMessage(q.trim()), 300);
    }
  }, [router.isReady, router.query.q]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const isPro = !!(usage?.isUnlimited || (user && hasActiveSubscription()));

  const tier = useMemo(() => {
    if (authLoading || (user && !statusChecked && !usage)) {
      return { label: 'Checking access...', description: 'Loading usage tier', icon: Sparkles };
    }
    if (isPro) {
      return { label: 'Pro', description: 'Unlimited KAHF AI usage', icon: Zap };
    }
    if (user) {
      return { label: 'Free account', description: '5 free KAHF AI messages / month — upgrade for unlimited', icon: Sparkles };
    }
    return { label: 'Guest', description: '1 free KAHF AI message — sign in for more', icon: Lock };
  }, [authLoading, user, isPro, statusChecked, usage]);

  const sendMessage = async (prompt = input) => {
    const content = prompt.trim();
    if (!content || isSending) return;

    const nextMessages = [...messages, { role: 'user', content }];
    setMessages(nextMessages);
    setInput('');
    setError('');
    setIsSending(true);

    try {
      const token = user ? await user.getIdToken() : null;
      const response = await fetch('/api/kahf-ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          sessionId,
          messages: nextMessages
        })
      });

      const data = await response.json();
      if (!response.ok) {
        setUsage(data.usage || null);
        throw new Error(data.error || 'KAHF AI request failed');
      }

      setUsage(data.usage || null);
      setMessages((current) => [...current, {
        role: 'assistant',
        content: data.reply || 'No response generated.'
      }]);
    } catch (err) {
      setError(err.message);
      setMessages((current) => current.filter((message, index) => index !== current.length - 1 || message.role !== 'user'));
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    sendMessage();
  };

  const TierIcon = tier.icon || Sparkles;

  return (
    <div className="min-h-screen bg-white">
      <Head>
        <title>KAHF AI — Options analysis | KAHF Capital</title>
        <meta name="description" content="Ask KAHF AI to walk through dark pool flow, options pricing, and 3 years of historical hit rates. Free 1-message demo." />
      </Head>
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-lg bg-green-100 flex items-center justify-center">
              <Bot className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">KAHF AI</h2>
              <p className="text-lg text-gray-600">Analysis for options traders</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
          <aside className="space-y-4">
            <div className="border border-gray-200 bg-white rounded-lg p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <TierIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">{tier.label}</h3>
                  <p className="text-sm text-gray-600">{tier.description}</p>
                </div>
              </div>

              {(usage || isPro) && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 text-sm text-gray-700">
                  {isPro || usage?.isUnlimited ? (
                    <span className="font-medium text-green-700">Unlimited messages available.</span>
                  ) : usage.remaining === 0 ? (
                    <span className="font-medium text-green-700">
                      Free message used. Upgrade to keep chatting.
                    </span>
                  ) : (
                    <span>
                      <span className="font-semibold">{usage.remaining}</span> of{' '}
                      <span className="font-semibold">{usage.limit}</span> free messages left.
                    </span>
                  )}
                </div>
              )}

              {!user && !authLoading && (
                <Link href="/pricing" className="mt-4 block">
                  <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5">
                    Start free trial <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              )}
              {user && !isPro && !authLoading && statusChecked && (
                <Link href="/pricing" className="mt-4 block">
                  <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-1.5">
                    Unlock Pro <ArrowRight className="h-4 w-4" />
                  </button>
                </Link>
              )}
              {user && !isPro && statusChecked && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const token = await user.getIdToken();
                      const res = await fetch('/api/subscription-status?deep=1', {
                        headers: { Authorization: `Bearer ${token}` }
                      });
                      const data = await res.json();
                      if (data.usage) setUsage(data.usage);
                      if (data.isPro) await refreshUserData();
                      else setError('No Pro subscription found for this account email. Use the same email you paid with, or contact support.');
                    } catch (e) {
                      setError(e.message);
                    }
                  }}
                  className="mt-2 w-full text-xs text-green-700 hover:text-green-800 underline"
                >
                  I already paid — refresh Pro status
                </button>
              )}
            </div>

            <div className="border border-gray-200 bg-white rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-3">The KAHF Read — 5 factors</h3>
              <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                <li><span className="font-semibold text-gray-900">Flow:</span> how unusual the dark pool volume is versus the 7-day average.</li>
                <li><span className="font-semibold text-gray-900">Direction:</span> call/put flow and where it printed versus the prior range.</li>
                <li><span className="font-semibold text-gray-900">Hit rates:</span> call, put, and straddle history at ~30 DTE, side by side.</li>
                <li><span className="font-semibold text-gray-900">Liquidity &amp; cost:</span> open interest, spreads, premium.</li>
                <li><span className="font-semibold text-gray-900">Catalyst &amp; priced-in:</span> whether there is a catalyst, and whether the move is already in the IV.</li>
              </ul>
              <p className="text-xs text-gray-500 mt-3">The factors describe the setup. The trading decision stays with you.</p>
            </div>

            <div className="border border-gray-200 bg-white rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-3">What the read calls out</h3>
              <p className="text-xs text-gray-500 mb-2">Context that sits next to the five factors:</p>
              <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                <li><span className="font-semibold text-gray-900">IV looks rich</span> vs the stock's historical realized move.</li>
                <li><span className="font-semibold text-gray-900">Skew is loud</span> — the market is already paying for one side.</li>
                <li><span className="font-semibold text-gray-900">Direction conflict</span> — the highest historical hit rate disagrees with the catalyst.</li>
                <li><span className="font-semibold text-gray-900">IV crush risk</span> — long premium past an earnings print.</li>
              </ul>
            </div>

            <div className="border border-gray-200 bg-white rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-3">Data sources</h3>
              <ul className="space-y-2 text-sm text-gray-600 list-disc pl-5">
                <li>Dark pool prints (Polygon) with 7-day volume baseline.</li>
                <li>Options analyzer: historical hit rate, premium, liquidity, IV across every strategy.</li>
                <li>Polygon news (catalyst-tagged) + live web search.</li>
                <li>5-day scanner lookback for recurring signals.</li>
              </ul>
            </div>
          </aside>

          <section className="border border-gray-200 bg-white rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Chat</h3>
                  <p className="text-sm text-gray-600">Ask about flow, hit rates, IV, or a ticker.</p>
                </div>
                <Link
                  href="/pricing"
                  className="text-sm font-medium text-green-600 hover:text-green-700"
                >
                  Start free trial →
                </Link>
              </div>
            </div>

            <div className="h-[540px] overflow-y-auto p-5 space-y-4 bg-white">
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    <MessageContent message={message} />
                  </div>
                </div>
              ))}

              {isSending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 text-gray-700 rounded-lg px-4 py-3 text-sm inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-green-600" />
                    Researching scanner, options, price, and news data...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {usage && !usage.isUnlimited && usage.remaining === 0 && (
              <div className="mx-5 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 flex items-center justify-between gap-3">
                <span>You've used your free KAHF AI message. Pro is unlimited.</span>
                <Link href="/pricing" className="font-semibold whitespace-nowrap text-green-700 hover:text-green-800 inline-flex items-center gap-1">
                  Start free trial <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}

            {error && (
              <div className="mx-5 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="px-5 pb-4 flex flex-wrap gap-2">
              {dailyPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => { track('sonnet_starter_clicked', { prompt }); sendMessage(prompt); }}
                  disabled={isSending}
                  className="px-3 py-1.5 rounded-full border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 text-sm disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="border-t border-gray-200 p-5">
              <div className="flex gap-3">
                <input
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  placeholder="Ask about a ticker, the scanner, or how IV compares to the historical move..."
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  disabled={isSending}
                />
                <button
                  type="submit"
                  disabled={isSending || !input.trim()}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-5 py-3 rounded-lg font-medium transition-colors flex items-center"
                >
                  <Send className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
