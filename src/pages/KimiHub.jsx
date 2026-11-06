import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  Bell,
  CheckCircle2,
  FlaskConical,
  Loader2,
  MessageSquare,
  PauseCircle,
  Phone,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  ThumbsDown,
  ThumbsUp
} from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import QrCode from '../components/kimi/QrCode';
import { fmt, useKimiApi } from '../components/kimi/useKimiApi';

const TABS = [
  { id: 'setup', label: 'Setup', icon: Phone },
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'alerts', label: 'Alerts', icon: Bell },
  { id: 'backtests', label: 'Backtests', icon: FlaskConical },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal }
];

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500';
const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50';
const btnSecondary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:opacity-50';

function Card({ title, subtitle, children, className = '', action = null }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-bold text-gray-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-sm text-gray-500">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

function Notice({ tone = 'error', children }) {
  const cls = tone === 'error' ? 'border-red-200 bg-red-50 text-red-700' : tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-green-200 bg-green-50 text-green-800';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

// ---------------------------------------------------------------------------
// Setup: phone -> OTP -> consent -> start texting
// ---------------------------------------------------------------------------

function StartTexting({ config }) {
  if (!config.kimiNumber) {
    return <Notice tone="warn">Kimi&apos;s texting number isn&apos;t configured yet. Your alerts settings are saved and texts start once it&apos;s live.</Notice>;
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-green-200 bg-green-50/60 p-5 text-center md:flex-row md:text-left">
      <div className="hidden rounded-xl border border-gray-200 bg-white p-2 md:block">
        <QrCode value={`${config.smsHref}`} size={148} />
      </div>
      <div className="flex-1">
        <h3 className="font-bold text-gray-900">Start texting Kimi</h3>
        <p className="mt-1 text-sm text-gray-600">
          <span className="hidden md:inline">Scan with your phone camera to open a text to </span>
          <span className="md:hidden">Tap to open a text to </span>
          <span className="font-mono font-semibold text-gray-900">{config.kimiNumber}</span>. Try &quot;$NVDA&quot; or &quot;BT $NVDA&quot;.
        </p>
        <a href={`${config.smsHref}${config.smsHref.includes('?') ? '&' : '?'}body=${encodeURIComponent('Hi Kimi')}`} className={`${btnPrimary} mt-3 md:hidden`}>
          <Smartphone className="h-4 w-4" /> Start texting Kimi
        </a>
      </div>
    </div>
  );
}

function SetupPanel({ api, profile, config, onProfile, onVerified }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState(false);
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [changing, setChanging] = useState(false);
  const verified = profile.sms_enabled && !changing;

  const sendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/api/kimi/onboarding', { method: 'POST', body: { action: 'send_code', phone } });
      setSent(res);
      if (res.dev_code) setCode(res.dev_code);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api('/api/kimi/onboarding', { method: 'POST', body: { action: 'verify', code, consent, consent_version: config.consent.version } });
      onVerified();
      onProfile(res.profile);
      setDone(res.welcome_dry_run ? 'Verified. Dry run is on, so the welcome text was logged instead of sent.' : 'Verified. Kimi just texted you a welcome message.');
      setChanging(false);
      setSent(null);
      setCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleOptOut = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await api('/api/kimi/profile', { method: 'POST', body: { action: profile.opted_out ? 'opt_in' : 'opt_out' } });
      onProfile(res.profile);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (verified) {
  return (
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card title="Your number" subtitle="Kimi texts this number and answers texts from it.">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
          <div>
              <div className="font-mono text-lg font-semibold text-gray-900">{profile.phone_masked}</div>
              <div className="text-xs text-gray-500">
                Opted in {fmt.dateTime(profile.consent_at)} · consent {profile.consent_version}
            </div>
          </div>
          </div>
          {done && <div className="mt-4"><Notice tone="ok">{done}</Notice></div>}
          {profile.opted_out && <div className="mt-4"><Notice tone="warn">Texts are off (you opted out). Turn them back on below or text START.</Notice></div>}
          {error && <div className="mt-4"><Notice>{error}</Notice></div>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} onClick={() => setChanging(true)}>
              Change number
              </button>
            <button type="button" className={btnSecondary} onClick={toggleOptOut} disabled={busy}>
              {profile.opted_out ? 'Turn texts back on' : 'Stop all texts'}
            </button>
        </div>
        </Card>
        <Card title="Text Kimi">
          <StartTexting config={config} />
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Reply MORE to an alert for details, BT to backtest it, PAUSE to mute alerts for 24h, HELP for help, STOP to cancel.
          </p>
        </Card>
          </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
      <Card title="Connect your phone" subtitle="Verify your number, then opt in to Kimi's texts.">
        <form onSubmit={sendCode} className="space-y-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600" htmlFor="kimi-phone">
            1. Mobile number
                      </label>
                      <div className="flex gap-2">
            <input id="kimi-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(415) 555-0199" value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} required />
            <button type="submit" className={btnPrimary} disabled={busy || !phone.trim()}>
              {busy && !sent ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sent ? 'Resend' : 'Text me a code'}
                        </button>
                      </div>
          {sent && (
            <p className="text-sm text-gray-600">
              Code sent to <span className="font-mono">{sent.phone_masked}</span>. It expires in 10 minutes.
              {sent.dev_code && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-amber-800">dev: {sent.dev_code}</span>}
            </p>
          )}
                  </form>

        <form onSubmit={verify} className="mt-6 space-y-4 border-t border-gray-100 pt-5">
                    <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600" htmlFor="kimi-code">
              2. Verification code
                      </label>
            <input id="kimi-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} className={`${inputCls} mt-1.5 w-40 font-mono tracking-widest`} />
                    </div>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-green-600" />
                        <span className="text-xs leading-relaxed text-gray-700">
              <span className="font-semibold text-gray-900">3. </span>
              {config.consent.text}
                        </span>
                      </label>
          {error && <Notice>{error}</Notice>}
          <button type="submit" className={`${btnPrimary} w-full py-2.5`} disabled={busy || code.length !== 6 || !consent || !sent}>
            {busy && sent ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Verify and turn on texts
          </button>
          <p className="text-[11px] leading-relaxed text-gray-500">{config.disclaimers.onboarding}</p>
        </form>
      </Card>
      <Card title="What you'll get">
        <ul className="space-y-3 text-sm text-gray-700">
          <li className="flex gap-2.5">
            <Bell className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> A text when KAHF&apos;s dark pool backend flags an unusual print, filtered by your watchlist and limits.
          </li>
          <li className="flex gap-2.5">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> Reply BT and Kimi backtests call, put and straddle structures on it, then texts you the ranking.
          </li>
          <li className="flex gap-2.5">
            <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-green-600" /> Quiet hours, daily caps, digests and PAUSE whenever you want fewer texts.
          </li>
        </ul>
        <div className="mt-5">
          <StartTexting config={config} />
                    </div>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat (same thread and memory as texts)
// ---------------------------------------------------------------------------

function ChatPanel({ api }) {
  const [messages, setMessages] = useState([]);
  const [running, setRunning] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rated, setRated] = useState({});
  const endRef = useRef(null);

  const load = useCallback(async () => {
    const res = await api('/api/kimi/chat');
    setMessages(res.messages);
    setRunning(res.running_backtests || []);
  }, [api]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  useEffect(() => {
    if (!running.length) return undefined;
    const t = setInterval(() => load().catch(() => {}), 3000);
    return () => clearInterval(t);
  }, [running.length, load]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (value) => {
    const body = (value ?? text).trim();
    if (!body || busy) return;
    setBusy(true);
    setError('');
    setText('');
    setMessages((m) => [...m, { id: `pending_${Date.now()}`, direction: 'inbound', channel: 'web', body, at: new Date().toISOString(), pending: true }]);
    try {
      const res = await api('/api/kimi/chat', { method: 'POST', body: { text: body, client_id: `${Date.now()}-${Math.random().toString(36).slice(2)}` } });
      setMessages(res.messages);
      setRunning(res.running_backtests || []);
    } catch (err) {
      setError(err.message);
      await load().catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const rate = async (id, rating) => {
    setRated((r) => ({ ...r, [id]: rating }));
    await api('/api/kimi/chat', { method: 'POST', body: { action: 'feedback', message_id: id, rating } }).catch(() => {});
  };

                        return (
    <Card title="Chat with Kimi" subtitle="One conversation and memory across iMessage, SMS and the web.">
      <div className="flex h-[520px] flex-col">
        <div className="flex-1 space-y-3 overflow-y-auto rounded-xl bg-gray-50 p-4">
          {!messages.length && <p className="py-16 text-center text-sm text-gray-500">Ask about a ticker ($NVDA), reply MORE to an alert, or type BT $CSX to compare structures.</p>}
          {messages.map((m) => {
            const mine = m.direction === 'inbound';
            return (
              <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${mine ? 'rounded-br-sm bg-green-600 text-white' : 'rounded-bl-sm border border-gray-200 bg-white text-gray-900'} ${m.pending ? 'opacity-60' : ''}`}>
                              {m.body}
                  {m.related_backtest_id && !mine && (
                    <Link href={`/kimi/backtests/${m.related_backtest_id}`} className="mt-1.5 block text-xs font-semibold text-green-700 hover:underline">
                      Open results
                                  </Link>
                              )}
                            </div>
                <div className="mt-1 flex items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-gray-400">
                  <span>
                    {m.channel}
                    {m.kind && m.kind !== 'reply' && m.kind !== 'user' ? ` · ${m.kind}` : ''} · {fmt.dateTime(m.at)}
                    {m.dry_run ? ' · dry run' : ''}
                            </span>
                  {!mine && m.kind === 'reply' && (
                    <span className="inline-flex gap-1 normal-case">
                      <button type="button" aria-label="Helpful" onClick={() => rate(m.id, 'up')} className={rated[m.id] === 'up' ? 'text-green-600' : 'hover:text-gray-600'}>
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button type="button" aria-label="Not helpful" onClick={() => rate(m.id, 'down')} className={rated[m.id] === 'down' ? 'text-red-500' : 'hover:text-gray-600'}>
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
                          </div>
                        );
          })}
          {busy && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Kimi is typing…
            </div>
          )}
          {running.length > 0 && !busy && (
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Backtest running, results will appear here.
                  </div>
          )}
          <div ref={endRef} />
        </div>
        {error && <div className="mt-2"><Notice>{error}</Notice></div>}
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['MORE', 'BT $NVDA', '$CSX dark pool', 'what are my settings?'].map((q) => (
            <button key={q} type="button" onClick={() => send(q)} disabled={busy} className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700 hover:bg-gray-50">
              {q}
            </button>
          ))}
        </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
            send();
          }}
          className="mt-2 flex gap-2"
        >
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Text Kimi…" className={inputCls} maxLength={2000} />
          <button type="submit" className={btnPrimary} disabled={busy || !text.trim()}>
            <Send className="h-4 w-4" /> Send
                    </button>
                  </form>
                </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Alerts and backtests
// ---------------------------------------------------------------------------

export function structureName(s) {
  return s === 'call' ? 'Long call' : s === 'put' ? 'Long put' : s === 'straddle' ? 'ATM straddle' : s || '—';
}

function ReturnPill({ value }) {
  if (typeof value !== 'number') return <span className="text-gray-400">—</span>;
  return <span className={value >= 0 ? 'text-green-700' : 'text-red-600'}>{fmt.pct(value, 2, true)}</span>;
}

function AlertsPanel({ api }) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(null);

  useEffect(() => {
    api('/api/kimi/alerts')
      .then((res) => setAlerts(res.alerts))
      .catch((err) => setError(err.message));
  }, [api]);

  const backtest = async (alertId) => {
    setRunning(alertId);
    setError('');
    try {
      const res = await api('/api/kimi/backtests', { method: 'POST', body: { config: { alert_id: alertId } } });
      router.push(`/kimi/backtests/${res.job_id}`);
    } catch (err) {
      setError(err.message);
      setRunning(null);
    }
  };

  return (
    <Card title="Alert history" subtitle="Every alert traces to a KAHF backend signal. Forward returns fill in after T+1 and T+5 trading days.">
      {error && <div className="mb-3"><Notice>{error}</Notice></div>}
      {!alerts ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : !alerts.length ? (
        <p className="py-10 text-center text-sm text-gray-500">No alerts yet. They&apos;ll show up here as Kimi texts them.</p>
                ) : (
                  <div className="divide-y divide-gray-100">
          {alerts.map((a) => (
            <div key={a.alert_id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/kimi/alerts/${encodeURIComponent(a.alert_id)}`} className="text-lg font-black text-gray-900 hover:text-green-700">
                    ${a.ticker}
                  </Link>
                  <span className="text-xs text-gray-500">{fmt.date(a.signal_date)} · sent {fmt.dateTime(a.sent_at)}</span>
                  {a.status === 'retracted' && <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-red-700">Retracted</span>}
                  {a.digest && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">Digest</span>}
                            </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                  {a.notional ? <span>Notional <b>{fmt.usd(a.notional)}</b></span> : null}
                  {a.volume_ratio ? <span>Volume <b>{a.volume_ratio.toFixed(1)}x</b> 7-day avg</span> : null}
                  {a.structure ? <span>Read <b>{structureName(a.structure)}{a.strike ? ` $${a.strike}` : ''}</b>{a.hit_rate ? ` · ${a.hit_rate}% hit rate` : ''}</span> : null}
                  <span>T+1d <ReturnPill value={a.forward_returns?.t1d?.return_pct} /></span>
                  <span>T+5d <ReturnPill value={a.forward_returns?.t5d?.return_pct} /></span>
                            </div>
                          </div>
              <div className="flex shrink-0 gap-2">
                {a.backtest_job_id && (
                  <Link href={`/kimi/backtests/${a.backtest_job_id}`} className={btnSecondary}>
                    Results
                  </Link>
                )}
                <button type="button" className={btnPrimary} onClick={() => backtest(a.alert_id)} disabled={running === a.alert_id}>
                  {running === a.alert_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
                              Backtest this
                            </button>
                          </div>
                        </div>
          ))}
                  </div>
                )}
    </Card>
  );
}

function BacktestsPanel({ api }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/api/kimi/backtests')
      .then((res) => setRows(res.backtests))
      .catch((err) => setError(err.message));
  }, [api]);
  return (
    <Card title="Your backtests" subtitle="Text BT $TICKER, reply BT to an alert, or ask Kimi to compare structures.">
      {error && <Notice>{error}</Notice>}
      {!rows ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-gray-400" /></div>
      ) : !rows.length ? (
        <p className="py-10 text-center text-sm text-gray-500">No backtests yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="py-2 pr-3">Ticker</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Top structure</th>
                <th className="py-2 pr-3 text-right">Sharpe</th>
                <th className="py-2 pr-3 text-right">Win rate</th>
                <th className="py-2 pr-3">Source</th>
                <th className="py-2">Run</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="py-2 pr-3 font-bold">
                    <Link href={`/kimi/backtests/${b.id}`} className="hover:text-green-700">${b.ticker}</Link>
                  </td>
                  <td className="py-2 pr-3 capitalize">{b.status}</td>
                  <td className="py-2 pr-3">{b.summary_metrics?.label || '—'}</td>
                  <td className="py-2 pr-3 text-right font-mono">{b.summary_metrics?.sharpe ?? '—'}</td>
                  <td className="py-2 pr-3 text-right font-mono">{typeof b.summary_metrics?.win_rate === 'number' ? `${b.summary_metrics.win_rate}%` : '—'}</td>
                  <td className="py-2 pr-3 text-gray-600">{b.source.replace('_', ' ')}</td>
                  <td className="py-2 text-gray-600">{fmt.dateTime(b.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
              </div>
            )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-gray-200 p-3">
      <span>
        <span className="block text-sm font-semibold text-gray-900">{label}</span>
        {hint && <span className="block text-xs text-gray-500">{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-green-600" />
                    </label>
  );
}

const tickersToText = (list) => (list || []).join(', ');
const textToTickers = (s) => [...new Set(String(s || '').split(/[\s,]+/).map((t) => t.replace(/^\$/, '').trim().toUpperCase()).filter(Boolean))];

function PreferencesPanel({ api, profile, config, onProfile }) {
  const p = profile.preferences;
  const [form, setForm] = useState(() => ({
    mode: p.watchlist.mode,
    tickers: tickersToText(p.watchlist.tickers),
    sectors: p.watchlist.sectors || [],
    muted: tickersToText(p.watchlist.muted),
    minNotionalM: p.min_notional ? Math.round(p.min_notional / 1e6) : 0,
    timezone: profile.timezone,
    quiet: p.quiet_hours,
    marketHoursOnly: p.market_hours_only,
    maxPerDay: p.max_alerts_per_day,
    digest: p.digest,
    pauseUntil: profile.paused_until ? profile.paused_until.slice(0, 10) : ''
  }));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const save = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    setStatus('');
    const oldMuted = new Set(p.watchlist.muted || []);
    const newMuted = new Set(textToTickers(form.muted));
    try {
      const res = await api('/api/kimi/profile', {
        method: 'POST',
        body: {
          action: 'update_preferences',
          preferences: {
            watchlist_mode: form.mode,
            set_tickers: textToTickers(form.tickers),
            set_sectors: form.sectors,
            mute_tickers: [...newMuted].filter((t) => !oldMuted.has(t)),
            unmute_tickers: [...oldMuted].filter((t) => !newMuted.has(t)),
            min_notional: Number(form.minNotionalM || 0) * 1e6,
            timezone: form.timezone,
            quiet_hours: form.quiet,
            market_hours_only: form.marketHoursOnly,
            max_alerts_per_day: Number(form.maxPerDay),
            digest: { enabled: form.digest.enabled, interval_minutes: Number(form.digest.interval_minutes) },
            paused_until: form.pauseUntil ? new Date(`${form.pauseUntil}T23:59:00`).toISOString() : null
          }
        }
      });
      onProfile(res.profile);
      setStatus('Saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-5">
      <Card title="Watchlist" subtitle="Which backend signals reach your phone. These are delivery filters; they don't change what counts as a signal.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            {[
              ['all', 'Every signal'],
              ['custom', 'Only my tickers and sectors']
            ].map(([v, label]) => (
              <label key={v} className="flex items-center gap-2 text-sm text-gray-800">
                <input type="radio" name="mode" checked={form.mode === v} onChange={() => set({ mode: v })} className="text-green-600" /> {label}
                    </label>
            ))}
                  </div>
                  <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Tickers</label>
            <input value={form.tickers} onChange={(e) => set({ tickers: e.target.value })} placeholder="NVDA, AAPL, CSX" className={`${inputCls} mt-1`} disabled={form.mode !== 'custom'} />
          </div>
          <div className="md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">Sectors</span>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {config.sectors.map((s) => {
                const on = form.sectors.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    disabled={form.mode !== 'custom'}
                    onClick={() => set({ sectors: on ? form.sectors.filter((x) => x !== s) : [...form.sectors, s] })}
                    className={`rounded-full border px-3 py-1 text-xs ${on ? 'border-green-600 bg-green-50 text-green-800' : 'border-gray-200 text-gray-600'} disabled:opacity-40`}
                  >
                    {s}
                  </button>
                );
              })}
                  </div>
          </div>
                  <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Muted tickers</label>
            <input value={form.muted} onChange={(e) => set({ muted: e.target.value })} placeholder="TSLA" className={`${inputCls} mt-1`} />
                  </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Minimum notional ($M)</label>
            <input type="number" min="0" step="50" value={form.minNotionalM} onChange={(e) => set({ minNotionalM: e.target.value })} className={`${inputCls} mt-1`} />
                </div>
        </div>
      </Card>

      <Card title="When Kimi texts">
        <div className="grid gap-4 md:grid-cols-2">
                    <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Timezone</label>
            <select value={form.timezone} onChange={(e) => set({ timezone: e.target.value })} className={`${inputCls} mt-1`}>
              {[...new Set([form.timezone, ...config.timezones])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace('_', ' ')}
                </option>
              ))}
            </select>
                    </div>
                      <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Max alerts per day</label>
            <input type="number" min={config.bounds.maxAlertsPerDay.min} max={config.bounds.maxAlertsPerDay.max} value={form.maxPerDay} onChange={(e) => set({ maxPerDay: e.target.value })} className={`${inputCls} mt-1`} />
                      </div>
          <div className="space-y-2">
            <Toggle checked={form.quiet.enabled} onChange={(v) => set({ quiet: { ...form.quiet, enabled: v } })} label="Quiet hours" hint="No alerts overnight, in your timezone." />
            {form.quiet.enabled && (
              <div className="flex items-center gap-2 text-sm">
                <input type="time" value={form.quiet.start} onChange={(e) => set({ quiet: { ...form.quiet, start: e.target.value } })} className={inputCls} />
                <span className="text-gray-500">to</span>
                <input type="time" value={form.quiet.end} onChange={(e) => set({ quiet: { ...form.quiet, end: e.target.value } })} className={inputCls} />
                    </div>
                  )}
                </div>
          <div className="space-y-2">
            <Toggle checked={form.digest.enabled} onChange={(v) => set({ digest: { ...form.digest, enabled: v } })} label="Digest mode" hint="Bundle alerts into one text every N minutes." />
            {form.digest.enabled && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-500">Every</span>
                <input type="number" min={config.bounds.digestInterval.min} max={config.bounds.digestInterval.max} value={form.digest.interval_minutes} onChange={(e) => set({ digest: { ...form.digest, interval_minutes: e.target.value } })} className={`${inputCls} w-24`} />
                <span className="text-gray-500">minutes</span>
                      </div>
            )}
                  </div>
          <Toggle checked={form.marketHoursOnly} onChange={(v) => set({ marketHoursOnly: v })} label="Market hours only" hint="Weekdays 9:30am-4pm ET." />
                      <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-600">Pause alerts until</label>
            <div className="mt-1 flex gap-2">
              <input type="date" value={form.pauseUntil} onChange={(e) => set({ pauseUntil: e.target.value })} className={inputCls} />
              {form.pauseUntil && (
                <button type="button" className={btnSecondary} onClick={() => set({ pauseUntil: '' })}>
                  Resume
                </button>
              )}
                      </div>
                      </div>
                  </div>
      </Card>

      {error && <Notice>{error}</Notice>}
      <div className="flex items-center gap-3">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save preferences
        </button>
        {status && <span className="text-sm font-semibold text-green-700">{status}</span>}
                </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KimiHub() {
  const router = useRouter();
  const { api, ready, signedIn, devBypass } = useKimiApi();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const tab = TABS.some((t) => t.id === router.query.tab) ? router.query.tab : null;

  const load = useCallback(async () => {
    try {
      setData(await api('/api/kimi/profile'));
    } catch (err) {
      setError(err.message);
    }
  }, [api]);

  useEffect(() => {
    if (ready && signedIn) load();
  }, [ready, signedIn, load]);

  const active = tab || (data && !data.profile.sms_enabled ? 'setup' : 'chat');
  const setTab = (id) => router.replace({ pathname: '/kimi', query: { ...router.query, tab: id } }, undefined, { shallow: true });
  const onProfile = useCallback((profile) => setData((d) => ({ ...d, profile })), []);
  const statusPill = useMemo(() => {
    if (!data) return null;
    const p = data.profile;
    if (!p.sms_enabled) return ['Phone not connected', 'bg-amber-100 text-amber-800'];
    if (p.opted_out) return ['Texts off', 'bg-gray-200 text-gray-700'];
    if (p.paused_until) return [`Paused until ${fmt.dateTime(p.paused_until)}`, 'bg-gray-200 text-gray-700'];
    return [`Texting ${p.phone_masked}`, 'bg-green-100 text-green-800'];
  }, [data]);

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <Head>
        <title>Kimi · KAHF Capital</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Kimi by KAHF Capital</p>
            <h1 className="mt-1 text-3xl font-black tracking-tight text-gray-900">Your Kimi</h1>
          </div>
          {statusPill && <span className={`self-start rounded-full px-3 py-1 text-xs font-semibold sm:self-auto ${statusPill[1]}`}>{statusPill[0]}</span>}
                </div>

        {devBypass && (
          <div className="mb-4">
            <Notice tone="warn">Development mode: acting as a local dev user. Production requires signing in.</Notice>
          </div>
        )}

        {!ready ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : !signedIn ? (
          <Card className="mx-auto max-w-md text-center">
            <h2 className="text-lg font-bold text-gray-900">Sign in to set up Kimi</h2>
            <p className="mt-1 text-sm text-gray-600">Connect your phone, choose your alerts and chat with Kimi.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/login?redirect=/kimi" className={btnPrimary}>Sign in</Link>
              <Link href="/signup?redirect=/kimi" className={btnSecondary}>Create account</Link>
            </div>
          </Card>
        ) : error ? (
          <Notice>{error}</Notice>
        ) : !data ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            <nav className="mb-5 flex flex-wrap gap-2">
              {TABS.map((t) => {
                const Icon = t.icon;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${active === t.id ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}`}
                  >
                    <Icon className="h-4 w-4" /> {t.label}
                  </button>
                );
              })}
            </nav>
            {active === 'setup' && <SetupPanel api={api} profile={data.profile} config={data.config} onProfile={onProfile} onVerified={() => setTab('setup')} />}
            {active === 'chat' && <ChatPanel api={api} />}
            {active === 'alerts' && <AlertsPanel api={api} />}
            {active === 'backtests' && <BacktestsPanel api={api} />}
            {active === 'preferences' && <PreferencesPanel api={api} profile={data.profile} config={data.config} onProfile={onProfile} />}
            <p className="mt-8 text-xs leading-relaxed text-gray-500">{data.config.disclaimers.onboarding}</p>
          </>
        )}
      </main>
      <Footer />
    </div>
  );
}
