import React, { useEffect, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/router';
import { Bot, Send, Sparkles, ArrowRight } from 'lucide-react';
import { track } from '../../lib/analytics';

// Fallback script if /api/home-preview is unavailable. Generic on purpose
// (no specific dollar amounts that could be stale).
const FALLBACK_SCRIPT = [
  {
    user: 'Find me a high-conviction trade right now.',
    answer: [
      "I'd run the KAHF Read on every scanner candidate first — 5 factors:",
      '',
      '- **Conviction** — dark pool volume ratio ≥ 3.0x',
      '- **Direction** — call/put flow + where it printed vs the range',
      '- **Edge** — the chosen structure’s historical hit rate at 30 DTE',
      '- **Liquidity & cost** — tight spreads, real OI',
      '- **Catalyst & priced-in** — a real catalyst, and whether the move is already in the IV',
      '',
      "Open the full chat to see today's actual picks with live prices."
    ].join('\n')
  },
  {
    user: 'How do you decide what to recommend?',
    answer: [
      "I compare three numbers per ticker at ~30 DTE — directional bullish, directional bearish, and non-directional — and pick the one with the highest historical hit rate.",
      '',
      '- Then I reconcile that against the forward catalyst direction.',
      '- If the historical edge and the catalyst agree, that\'s the play.',
      '- If they disagree, I either flag the conflict or default to the non-directional setup.',
      '',
      'Finally I sanity-check IV regime, skew, and post-event crush risk before greenlighting.'
    ].join('\n')
  }
];

function pluralize(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function buildLiveScript(preview) {
  if (!preview?.available || !preview.signals?.length) return FALLBACK_SCRIPT;
  const sigs = preview.signals;
  const top = sigs[0];
  const second = sigs[1] || null;

  const topPriceLine = top.currentPrice
    ? `$${top.currentPrice.toFixed(2)}${top.changePct !== null ? ` (${top.changePct >= 0 ? '+' : ''}${top.changePct.toFixed(2)}% today)` : ''}`
    : 'live price unavailable';

  const findTrade = {
    user: 'Find me a high-conviction trade right now.',
    answer: [
      `**$${top.ticker} — Worth a look.** ${top.volumeRatio.toFixed(2)}x dark pool volume is the loudest signal on the board today.`,
      '',
      `- **Flow:** ${top.volumeRatio.toFixed(2)}x volume ratio, ${pluralize(top.tradeCount, 'print')} totaling $${(top.darkPoolValue / 1e6).toFixed(0)}M notional. Dark pool VWAP was $${top.darkPoolAvgPrice.toFixed(2)}.`,
      `- **Price now:** ${topPriceLine}.`,
      '- **Best strategy:** I\'d run the historical hit-rate analysis at 30 DTE before committing — whichever setup has the strongest edge wins.',
      '- **Catalyst check:** I\'d run `get_news` and a web search for the next 30-day catalyst.',
      '',
      `Setups that clear all five get a "Trade" verdict — open the full chat to see how $${top.ticker} actually scores against the historical edge and priced-in IV.`
    ].join('\n')
  };

  const compare = second
    ? {
        user: `What's the best play on $${second.ticker}?`,
        answer: [
          `**$${second.ticker} — Watch, not trade${second.currentPrice ? ` (spot ~$${second.currentPrice.toFixed(2)})` : ''}.** Strong flow but I need to lock in the historical edge before recommending a strike.`,
          '',
          `- Volume ratio ${second.volumeRatio.toFixed(2)}x — institutional positioning is real.`,
          `- Dark pool VWAP was $${second.darkPoolAvgPrice.toFixed(2)}.`,
          '- I\'d run the historical hit-rate analysis at ~30 DTE and reconcile it against the forward catalyst direction.',
          '',
          'In live chat I pull both and reconcile them. If the backward-looking edge disagrees with the forward catalyst, I flag the conflict.'
        ].join('\n')
      }
    : null;

  const scoreTable = {
    user: 'Score the top scanner tickers right now.',
    answer: [
      `Today's top ${sigs.length} by volume ratio (live data, ${preview.scannerDate || 'today'}):`,
      '',
      '| Ticker | Vol Ratio | DP Avg | Live Price | Notional |',
      '|---|---|---|---|---|',
      ...sigs.map((s) => `| **$${s.ticker}** | ${s.volumeRatio.toFixed(2)}x | $${s.darkPoolAvgPrice.toFixed(2)} | ${s.currentPrice ? `$${s.currentPrice.toFixed(2)}` : '—'} | $${(s.darkPoolValue / 1e6).toFixed(0)}M |`),
      '',
      'Ranking is volume-ratio only — open the full chat to layer in the best-strategy hit rate, catalyst direction, and IV regime for each name.'
    ].join('\n')
  };

  return [findTrade, compare, scoreTable].filter(Boolean);
}

export default function HomeAIPreview() {
  const router = useRouter();
  const [preview, setPreview] = useState(null);
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [index, setIndex] = useState(0);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [phase, setPhase] = useState('user');
  const [input, setInput] = useState('');
  const containerRef = useRef(null);

  // Pull live scanner + prices once on mount so the demo never shows stale numbers.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/home-preview')
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setPreview(data);
          setPreviewLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPreviewLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  const script = useMemo(() => buildLiveScript(preview), [preview]);
  const isLive = preview?.available && (preview?.signals?.length ?? 0) > 0;

  useEffect(() => {
    if (!previewLoaded) return;
    let cancelled = false;
    const current = script[index];
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
            setIndex((n) => (n + 1) % script.length);
          }, 5200);
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
  }, [index, previewLoaded, script]);

  const submit = (e) => {
    e?.preventDefault?.();
    const q = input.trim() || script[index].user;
    track('home_ai_demo_submit', { hasInput: !!input.trim() });
    router.push({ pathname: '/kahf-ai', query: { q } });
  };

  const current = script[index] || FALLBACK_SCRIPT[0];

  return (
    <div ref={containerRef} className="w-full max-w-3xl mx-auto">
      <div className="rounded-2xl border border-gray-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 bg-gray-50 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-green-100 flex items-center justify-center">
              <Bot className="h-4 w-4 text-green-600" />
            </div>
            <span className="text-sm font-semibold text-gray-900">KAHF AI</span>
            <span className="hidden sm:inline-flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 text-[11px] font-medium">
              <Sparkles className="h-3 w-3" /> Sample
            </span>
            {isLive && (
              <span className="hidden md:inline text-[11px] text-gray-500">
                Live scanner data {preview.scannerDate ? `· ${preview.scannerDate}` : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => {
              track('home_ai_demo_open_full');
              router.push('/kahf-ai');
            }}
            className="text-xs font-semibold text-green-700 hover:text-green-800 inline-flex items-center gap-1"
          >
            Open full chat <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        <div className="px-5 py-5 min-h-[320px] sm:min-h-[360px] space-y-3 bg-white">
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

      <div className="flex items-center justify-between mt-3">
        <p className="text-[11px] text-gray-500">
          {isLive
            ? 'Sample conversation using real signals from today\'s scanner. Live AI responses run in the full chat.'
            : 'Sample conversation. Live analysis runs in the full chat.'}
        </p>
        <div className="flex items-center gap-1.5">
          {script.map((_, i) => (
            <span
              key={i}
              className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-green-600' : 'w-1.5 bg-gray-300'}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
