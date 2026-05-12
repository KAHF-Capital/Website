import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Bot, Send, Sparkles, ArrowRight } from 'lucide-react';
import { track } from '../../lib/analytics';

// A scripted "living" AI demo for the homepage. Cycles through preset prompts
// and answers so cold visitors see KAHF AI work before they touch it.
const SCRIPT = [
  {
    user: 'Find me a high-conviction trade right now.',
    answer: [
      "**$NVDA** is the strongest setup on the board today.",
      '',
      '- **Volume ratio:** 4.2× vs 7-day average ($1.8B in dark pool prints)',
      '- **Straddle hit rate:** 62% on the 30-day ATM (last 8 earnings)',
      '- **Liquidity:** spreads <0.5%, OI > 50k on Apr 18 expiry',
      '- **Catalyst:** earnings in 9 trading days',
      '',
      'Four out of four checks. If you want directional, look at the front-month ATM straddle — historical IV expansion into print runs ~12% on this name.'
    ].join('\n')
  },
  {
    user: 'What about $TSLA — anything?',
    answer: [
      "**$TSLA — watchlist, not trade.** Three of four checks.",
      '',
      '- Volume ratio 2.1× (decent, not screaming)',
      '- Straddle hit rate 48% (below threshold)',
      '- Options very liquid',
      '- No defined catalyst this week',
      '',
      "I'd want a real catalyst before sizing in. Set an alert and let it come to you."
    ].join('\n')
  },
  {
    user: 'Score the top scanner tickers right now.',
    answer: [
      "Top 5 by volume ratio, scored against my four checks:",
      '',
      '| Ticker | Score | Why |',
      '|---|---|---|',
      '| NVDA | 4/4 | Trade |',
      '| AAPL | 3/4 | Watchlist — no catalyst |',
      '| AMD | 3/4 | Watchlist — straddle 51% |',
      '| MU | 4/4 | Trade — earnings 12d |',
      '| AVGO | 2/4 | Skip |'
    ].join('\n')
  }
];

export default function HomeAIPreview() {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [phase, setPhase] = useState('user'); // user → typing → done
  const [input, setInput] = useState('');
  const containerRef = useRef(null);

  // Cycle through scripted prompts on a loop
  useEffect(() => {
    let cancelled = false;
    const current = SCRIPT[index];
    setTypedAnswer('');
    setPhase('user');

    const userTimer = setTimeout(() => {
      if (cancelled) return;
      setPhase('typing');

      const text = current.answer;
      let i = 0;
      const tick = () => {
        if (cancelled) return;
        i += Math.max(2, Math.floor(text.length / 220));
        setTypedAnswer(text.slice(0, i));
        if (i >= text.length) {
          setPhase('done');
          const advance = setTimeout(() => {
            if (cancelled) return;
            setIndex((n) => (n + 1) % SCRIPT.length);
          }, 4200);
          // Save advance timer for cleanup
          containerRef.current && (containerRef.current._advance = advance);
        } else {
          containerRef.current && (containerRef.current._typer = setTimeout(tick, 18));
        }
      };
      tick();
    }, 700);

    return () => {
      cancelled = true;
      clearTimeout(userTimer);
      if (containerRef.current?._typer) clearTimeout(containerRef.current._typer);
      if (containerRef.current?._advance) clearTimeout(containerRef.current._advance);
    };
  }, [index]);

  const submit = (e) => {
    e?.preventDefault?.();
    const q = input.trim() || SCRIPT[index].user;
    track('home_ai_demo_submit', { hasInput: !!input.trim() });
    router.push({ pathname: '/sonnet', query: { q } });
  };

  const current = SCRIPT[index];

  return (
    <div ref={containerRef} className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-green-100 flex items-center justify-center">
              <Bot className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-sm font-semibold text-gray-900">KAHF AI</span>
            <span className="hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-medium">
              <Sparkles className="h-3 w-3" /> Live
            </span>
          </div>
          <button
            onClick={() => {
              track('home_ai_demo_open_full');
              router.push('/sonnet');
            }}
            className="text-xs font-semibold text-green-700 hover:text-green-800 inline-flex items-center gap-1"
          >
            Open full chat <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="px-5 py-5 min-h-[280px] sm:min-h-[320px] space-y-3 bg-white">
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-green-600 text-white px-4 py-2.5 text-sm leading-relaxed">
              {current.user}
            </div>
          </div>
          <div className="flex justify-start">
            <div className="max-w-[90%] rounded-2xl rounded-bl-sm bg-gray-100 text-gray-900 px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap">
              {phase === 'user' && (
                <span className="inline-flex items-center gap-1 text-gray-500">
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse"></span>
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '120ms' }}></span>
                  <span className="inline-block w-1.5 h-1.5 bg-gray-400 rounded-full animate-pulse" style={{ animationDelay: '240ms' }}></span>
                </span>
              )}
              {phase !== 'user' && (
                <span dangerouslySetInnerHTML={{ __html: typedAnswer.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>') }} />
              )}
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="border-t border-gray-200 p-3 bg-white flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask anything: 'Score the scanner', 'Why is NVDA spiking?'..."
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
          />
          <button
            type="submit"
            className="bg-green-600 hover:bg-green-700 text-white font-semibold px-4 py-2.5 rounded-lg flex items-center gap-2 text-sm"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">Try it</span>
          </button>
        </form>
      </div>

      <div className="flex items-center justify-center gap-1.5 mt-3">
        {SCRIPT.map((_, i) => (
          <span
            key={i}
            className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-green-600' : 'w-1.5 bg-gray-300'}`}
          />
        ))}
      </div>
    </div>
  );
}
