import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, Download, Eye, Loader2, ShieldCheck } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../Footer';
import { fmt, useKimiApi } from '../../components/kimi/useKimiApi';
import { DataTable, Panel } from './KimiAdmin';

function TranscriptViewer({ api, userId }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setResult(await api('/api/admin/kimi/transcript', { method: 'POST', body: { user_id: userId, from: from || null, to: to ? `${to}T23:59:59` : null } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const exportUrl = `/api/admin/kimi/export?${new URLSearchParams({ user_id: userId, ...(from ? { from } : {}), ...(to ? { to } : {}) })}`;
  const download = async () => {
    const res = await api(exportUrl, { raw: true });
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kimi-messages-${userId}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Panel
      title="Transcript"
      subtitle="Message bodies load only on request. Every view and export is written to the audit log with your name and the time."
      actions={
        <>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs" aria-label="From" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1 text-xs" aria-label="To" />
          <button type="button" onClick={load} disabled={busy} className="inline-flex items-center gap-1 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />} View transcript
          </button>
          <button type="button" onClick={download} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50">
            <Download className="h-3.5 w-3.5" /> Export CSV
          </button>
        </>
      }
    >
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!result ? (
        <p className="py-6 text-center text-sm text-gray-400">Not loaded.</p>
      ) : (
        <>
          <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
            <ShieldCheck className="h-3.5 w-3.5" /> Audit entry {result.audit_id} recorded {fmt.dateTime(result.viewed_at)}
          </p>
          <div className="max-h-[560px] space-y-2 overflow-y-auto rounded-xl bg-gray-50 p-3">
            {!result.messages.length && <p className="text-sm text-gray-400">No messages in this range.</p>}
            {result.messages.map((m) => (
              <div key={m.id} className={`flex flex-col ${m.direction === 'inbound' ? 'items-start' : 'items-end'}`}>
                <div className={`max-w-[80%] rounded-xl px-3 py-1.5 text-sm ${m.direction === 'inbound' ? 'border border-gray-200 bg-white' : 'bg-green-600 text-white'}`}>{m.body}</div>
                <div className="mt-0.5 px-1 text-[10px] uppercase tracking-wider text-gray-400">
                  {fmt.dateTime(m.at)} · {m.channel} · {m.kind}
                  {m.intent ? ` · ${m.intent}` : ''}
                  {m.status !== 'sent' && m.status !== 'received' ? ` · ${m.status}` : ''}
                  {m.latency_ms ? ` · ${fmt.ms(m.latency_ms)}` : ''}
                  {m.fallback ? ' · fallback' : ''}
                  {m.redacted ? ' · redacted' : ''}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

export default function KimiAdminUser() {
  const router = useRouter();
  const { id } = router.query;
  const { api, ready, signedIn } = useKimiApi({ admin: true });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || !ready || !signedIn) return;
    api(`/api/admin/kimi/users/${encodeURIComponent(id)}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [id, ready, signedIn, api]);

  const p = data?.profile;
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Kimi user · Admin</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="mx-auto max-w-[1300px] px-4 py-8">
        <Link href="/admin/kimi?tab=users" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900">
          <ArrowLeft className="h-4 w-4" /> Users
        </Link>
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {!data && !error && <Loader2 className="h-6 w-6 animate-spin text-gray-400" />}
        {data && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              <Panel title={p.phone_masked || 'No verified phone'} subtitle={`${p.user_id}${p.email ? ` · ${p.email}` : ''}`}>
                <dl className="space-y-1.5 text-sm">
                  {[
                    ['Plan', p.plan],
                    ['Signed up', fmt.dateTime(p.created_at)],
                    ['Phone verified', fmt.dateTime(p.phone_verified_at)],
                    ['Last active', fmt.dateTime(p.last_active_at)],
                    ['Timezone', p.timezone],
                    ['Status', p.opted_out_at ? `Opted out ${fmt.dateTime(p.opted_out_at)}` : p.paused_until && new Date(p.paused_until) > new Date() ? `Paused until ${fmt.dateTime(p.paused_until)}` : 'Active']
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-gray-500">{k}</dt>
                      <dd className="text-right text-gray-900">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Panel>
              <Panel title="Consent record">
                {p.consent ? (
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between"><span className="text-gray-500">Version</span><span className="font-mono">{p.consent.version}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">Given</span><span>{fmt.dateTime(p.consent.at)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-500">IP</span><span className="font-mono">{p.consent.ip_masked || '—'}</span></div>
                    <p className="mt-2 rounded-lg bg-gray-50 p-2 text-xs leading-relaxed text-gray-600">{p.consent.text}</p>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No consent on file.</p>
                )}
              </Panel>
              <Panel title="Activity">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {[
                    ['Messages', data.stats.messages],
                    ['Alerts received', data.stats.alerts_received],
                    ['Alerts suppressed', data.stats.alerts_suppressed],
                    ['Backtests', data.stats.backtests],
                    ['Active days', data.stats.active_days]
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                      <div className="text-xs text-gray-500">{k}</div>
                      <div className="font-mono font-bold text-gray-900">{v}</div>
                    </div>
                  ))}
                </div>
                {data.conversation.flagged && (
                  <p className="mt-3 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">Flagged: {data.conversation.flag_reasons.join(', ')}</p>
                )}
                {data.conversation.summary && <p className="mt-3 text-xs leading-relaxed text-gray-600"><b>Memory:</b> {data.conversation.summary}</p>}
              </Panel>
            </div>
            <TranscriptViewer api={api} userId={p.user_id} />
            <div className="grid gap-5 xl:grid-cols-2">
              <DataTable
                title="Activity timeline"
                rows={data.timeline}
                filename={`kimi-timeline-${p.user_id}`}
                maxHeight={460}
                columns={[
                  { key: 'at', label: 'When', render: (r) => fmt.dateTime(r.at) },
                  { key: 'summary', label: 'Event' },
                  { key: 'channel', label: 'Channel' }
                ]}
              />
              <DataTable
                title="Alerts"
                rows={data.deliveries}
                filename={`kimi-deliveries-${p.user_id}`}
                maxHeight={460}
                columns={[
                  { key: 'alert_id', label: 'Signal' },
                  { key: 'status', label: 'Status', render: (r) => `${r.status}${r.dry_run ? ' (dry)' : ''}${r.reason ? `: ${r.reason}` : ''}` },
                  { key: 'sent_at', label: 'Sent', render: (r) => fmt.dateTime(r.sent_at) },
                  { key: 'engagement', label: 'Engagement', render: (r) => [r.replied_at && 'replied', r.clicked_at && 'clicked', r.backtest_at && 'backtest'].filter(Boolean).join(', ') || '—', csv: (r) => [r.replied_at && 'replied', r.clicked_at && 'clicked', r.backtest_at && 'backtest'].filter(Boolean).join('|') }
                ]}
              />
            </div>
            <div className="grid gap-5 xl:grid-cols-2">
              <DataTable
                title="Backtests"
                rows={data.backtests}
                filename={`kimi-backtests-${p.user_id}`}
                columns={[
                  { key: 'created_at', label: 'When', render: (r) => fmt.dateTime(r.created_at) },
                  { key: 'ticker', label: 'Ticker' },
                  { key: 'source', label: 'Source' },
                  { key: 'status', label: 'Status' },
                  { key: 'winner', label: '#1' }
                ]}
              />
              <DataTable
                title="Who viewed this user"
                rows={data.audit}
                filename={`kimi-audit-${p.user_id}`}
                columns={[
                  { key: 'at', label: 'When', render: (r) => fmt.dateTime(r.at) },
                  { key: 'actor', label: 'Admin' },
                  { key: 'action', label: 'Action' }
                ]}
                empty="No admin views yet"
              />
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
