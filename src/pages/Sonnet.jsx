import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AlertCircle, Bot, Loader2, Lock, Send, Sparkles, Zap } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { useAuth } from '../context/AuthContext';

const starterPrompts = [
  'Top dark pool setups today',
  'Analyze AAPL straddle',
  'Find bullish dark pool signals',
  'Research AAPL news and options'
];

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

export default function Sonnet() {
  const { user, loading: authLoading, hasActiveSubscription } = useAuth();
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Ask for quick volatility setups, straddle reads, or dark pool signal checks.'
    }
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState(null);
  const [sessionId, setSessionId] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    setSessionId(getOrCreateSessionId());
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

  const tier = useMemo(() => {
    if (authLoading) return { label: 'Checking access...', description: 'Loading usage tier' };
    if (user && hasActiveSubscription()) {
      return { label: 'VolAlert Pro', description: 'Unlimited KAHF AI usage', icon: Zap };
    }
    if (user) {
      return { label: 'Account', description: 'Unlimited KAHF AI usage', icon: Sparkles };
    }
    return { label: 'Free', description: '1 free KAHF AI message', icon: Lock };
  }, [authLoading, user, hasActiveSubscription]);

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
      const response = await fetch('/api/sonnet-chat', {
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
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-lg bg-green-100 flex items-center justify-center">
              <Bot className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <h2 className="text-3xl font-black text-gray-900 leading-tight tracking-tight">KAHF AI</h2>
              <p className="text-lg text-gray-600">Brief AI reads on dark pool and volatility setups</p>
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

              {usage && (
                <div className="mt-4 p-3 rounded-lg bg-gray-50 text-sm text-gray-700">
                  {usage.isUnlimited ? (
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
                <a
                  href="https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 block"
                >
                  <button className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                    Upgrade for unlimited
                  </button>
                </a>
              )}
            </div>

            <div className="border border-gray-200 bg-white rounded-lg p-5">
              <h3 className="font-semibold text-gray-900 mb-3">What KAHF AI Can Use</h3>
              <div className="space-y-3 text-sm text-gray-600">
                <p>Anything available on the website, including scanner history and signals.</p>
                <p>Straddle calculator data, option pricing, and historical profitability APIs.</p>
                <p>Public web research for news, qualitative context, and price checks.</p>
                <p>Dark pool, quantitative, and qualitative factors for recommendations.</p>
              </div>
            </div>
          </aside>

          <section className="border border-gray-200 bg-white rounded-lg overflow-hidden">
            <div className="bg-gray-50 border-b border-gray-200 px-5 py-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-gray-900">Chat</h3>
                  <p className="text-sm text-gray-600">Ask for direct, trade-focused outputs.</p>
                </div>
                <a
                  href="https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-green-600 hover:text-green-700"
                >
                  Upgrade to unlimited
                </a>
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
                    Researching scanner, straddle, price, and news data...
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {usage && !usage.isUnlimited && usage.remaining === 0 && (
              <div className="mx-5 mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                You used your free KAHF AI message. Upgrade to VolAlert Pro for unlimited chat.
              </div>
            )}

            {error && (
              <div className="mx-5 mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="px-5 pb-4 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
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
                  placeholder="Ask KAHF AI for research, a setup, ticker, or straddle read..."
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
