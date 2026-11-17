import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowDownRight, ArrowUpRight, Download, Loader2, Power, RefreshCw, Search, ShieldAlert, X } from 'lucide-react';
import Header from '../../components/Header';
import Footer from '../Footer';
import { BarList, COLORS, CohortGrid, Funnel, Histogram, TimeSeriesChart } from '../../components/kimi/charts';
import { downloadCsv } from '../../components/kimi/csv';
import { fmt, useKimiApi } from '../../components/kimi/useKimiApi';

export const ADMIN_TABS = [
  ['overview', 'Overview'],
  ['funnel', 'Funnel & retention'],
  ['alerts', 'Alerts'],
  ['backtests', 'Backtests'],
  ['conversations', 'Conversations'],
  ['users', 'Users'],
  ['health', 'System health & cost']
];

const inputCls = 'rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500';

function etToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

function shiftDay(day, n) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatValue(v, unit) {
  if (v === null || v === undefined) return '—';
  if (unit === 'ms') return fmt.ms(v);
  if (unit === 'usd') return `$${Number(v).toFixed(2)}`;
  if (unit === 'pct') return `${Number(v).toFixed(1)}%`;
  return fmt.num(v);
}

export function Panel({ title, subtitle, actions, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-bold text-gray-900">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-gray-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

function Delta({ value, previous, lowerIsBetter = false }) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-gray-400">{previous === 0 ? 'new this period' : 'no prior data'}</span>;
  }
  if (value === 0) return <span className="text-xs text-gray-500">flat</span>;
  const good = lowerIsBetter ? value < 0 : value > 0;
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${good ? 'text-green-700' : 'text-red-600'}`}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function deltaPct(value, previous) {
  if (typeof value !== 'number' || typeof previous !== 'number') return null;
  if (previous === 0) return value === 0 ? 0 : null;
  return Math.round(((value - previous) / Math.abs(previous)) * 1000) / 10;
}

export function Kpi({ label, value, unit, delta: deltaProp, lowerIsBetter, previous, days, note }) {
  const delta = deltaProp === undefined ? deltaPct(value, previous) : deltaProp;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 font-mono text-2xl font-black text-gray-900">{formatValue(value, unit)}</div>
      <div className="mt-1 flex items-center gap-1.5">
        {note ? <span className="text-xs text-gray-400">{note}</span> : <Delta value={delta} previous={previous} lowerIsBetter={lowerIsBetter} />}
        {!note && previous !== undefined && previous !== null && delta !== null && delta !== undefined && (
          <span className="text-[11px] text-gray-400">
            vs {formatValue(previous, unit)}
            {days ? ` prior ${days}d` : ''}
          </span>
        )}
      </div>
    </div>
  );
}

export function CsvButton({ filename, rows, columns }) {
  return (
    <button
      type="button"
      onClick={() => downloadCsv(filename, rows, columns)}
      disabled={!rows?.length}
      className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40"
    >
      <Download className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

/** Table with CSV export and optional search. columns: [{ key, label, render?, align?, csv? }] */
export function DataTable({ title, subtitle, rows = [], columns, filename, searchKeys = null, onRowClick = null, maxHeight = 420, empty = 'No rows for this range' }) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => {
    if (!searchKeys || !q.trim()) return rows;
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(needle)));
  }, [rows, q, searchKeys]);
  return (
    <Panel
      title={title}
      subtitle={subtitle}
      actions={
        <>
          {searchKeys && (
            <label className="relative">
              <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-gray-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" className={`${inputCls} w-48 py-1 pl-7`} />
            </label>
          )}
          <CsvButton filename={filename} rows={filtered} columns={columns.map((c) => ({ key: c.key, label: c.label, csv: c.csv }))} />
        </>
      }
    >
      {!filtered.length ? (
        <p className="py-8 text-center text-sm text-gray-400">{empty}</p>
      ) : (
        <div className="overflow-auto" style={{ maxHeight }}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white text-left text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} className={`whitespace-nowrap py-2 pr-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((row, i) => (
                <tr key={row.id || row.user_id || row.key || i} onClick={onRowClick ? () => onRowClick(row) : undefined} className={onRowClick ? 'cursor-pointer hover:bg-green-50/50' : 'hover:bg-gray-50'}>
                  {columns.map((c) => (
                    <td key={c.key} className={`whitespace-nowrap py-1.5 pr-3 ${c.align === 'right' ? 'text-right font-mono' : ''}`}>
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

function OverviewTab({ data, range }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {data.kpis.map((k) => (
          <Kpi key={k.key} {...k} days={range.days} />
        ))}
      </div>
      <Panel title="Activity" subtitle="Daily, from the rollup table (ET days)">
        <TimeSeriesChart
          data={data.series}
          series={[
            { key: 'inbound', label: 'Inbound messages', color: COLORS.green },
            { key: 'outbound', label: 'Outbound messages', color: COLORS.emerald },
            { key: 'alerts_sent', label: 'Alerts sent', color: COLORS.blue },
            { key: 'backtests_requested', label: 'Backtests', color: COLORS.violet }
          ]}
        />
      </Panel>
    </div>
  );
}

function FunnelTab({ data }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel title="Signup funnel" subtitle={`${data.cohort_size} users started signup in this range. ${data.note}`} actions={<CsvButton filename="kimi-funnel" rows={data.steps} columns={[{ key: 'label' }, { key: 'count' }, { key: 'pct_of_start' }, { key: 'pct_of_previous' }]} />}>
        <Funnel steps={data.steps} />
      </Panel>
      <Panel
        title="Weekly cohort retention"
        subtitle="Share of each signup-week cohort active in week N after signup."
        actions={
          <CsvButton
            filename="kimi-cohorts"
            rows={data.cohorts}
            columns={[{ key: 'week' }, { key: 'size' }, ...Array.from({ length: 8 }, (_, k) => ({ key: `w${k}`, label: `W${k}`, csv: (r) => r.retention[k] ?? '' }))]}
          />
        }
      >
        <CohortGrid cohorts={data.cohorts} />
      </Panel>
    </div>
  );
}

function AlertDrillIn({ api, alertId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api(`/api/admin/kimi/alerts/${encodeURIComponent(alertId)}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [api, alertId]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-gray-900/50 p-4 pt-16" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Backend signal</p>
            <h2 className="text-xl font-black text-gray-900">{alertId}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {!data && !error && <Loader2 className="h-5 w-5 animate-spin text-gray-400" />}
        {data && (
          <div className="space-y-4">
            <div className="grid gap-2 text-xs sm:grid-cols-4">
              {[
                ['Status', data.alert.status],
                ['Signal time', fmt.dateTime(data.alert.signal_at)],
                ['Received', fmt.dateTime(data.alert.received_at)],
                ['Param version', data.alert.backend_param_version || 'not versioned']
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="uppercase tracking-wider text-gray-500">{k}</div>
                  <div className="mt-0.5 truncate font-mono font-semibold text-gray-900" title={v}>
                    {v}
                  </div>
                </div>
              ))}
            </div>
            <div>
              <h3 className="mb-1 text-sm font-bold text-gray-900">Payload (unmodified)</h3>
              <pre className="max-h-64 overflow-auto rounded-lg bg-gray-900 p-3 text-xs text-green-200">{JSON.stringify(data.alert.signal_payload, null, 2)}</pre>
              {data.alert.revisions?.length > 0 && <p className="mt-1 text-xs text-gray-500">{data.alert.revisions.length} revision(s) recorded.</p>}
            </div>
            <DataTable
              title={`Recipients (${data.recipients.length})`}
              rows={data.recipients}
              filename={`kimi-recipients-${alertId}`}
              maxHeight={300}
              columns={[
                { key: 'phone_masked', label: 'Phone' },
                { key: 'plan', label: 'Plan' },
                { key: 'status', label: 'Status', render: (r) => `${r.status}${r.dry_run ? ' (dry run)' : ''}` },
                { key: 'reason', label: 'Reason', render: (r) => (r.reason ? `${r.reason}${r.cap_window ? ` (${r.cap_window})` : ''}` : '—') },
                { key: 'signal_to_text_ms', label: 'Signal→text', align: 'right', render: (r) => fmt.ms(r.signal_to_text_ms) },
                { key: 'replied_at', label: 'Replied', render: (r) => (r.replied_at ? 'yes' : '—') },
                { key: 'clicked_at', label: 'Clicked', render: (r) => (r.clicked_at ? 'yes' : '—') },
                { key: 'backtest_at', label: 'Backtest', render: (r) => (r.backtest_at ? 'yes' : '—') },
                { key: 'user_id', label: 'User', render: (r) => <Link href={`/admin/kimi/users/${r.user_id}`} className="text-green-700 hover:underline">{r.user_id}</Link> }
              ]}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function AlertsTab({ data, range, api }) {
  const [drill, setDrill] = useState(null);
  const e = data.engagement;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi label="Backend signals" value={data.totals.signals.value} previous={data.totals.signals.previous} delta={data.totals.signals.delta} days={range.days} />
        <Kpi label="Alerts sent" value={data.totals.sent.value} previous={data.totals.sent.previous} delta={data.totals.sent.delta} days={range.days} />
        <Kpi label="Suppressed" value={data.totals.suppressed.value} previous={data.totals.suppressed.previous} delta={data.totals.suppressed.delta} days={range.days} lowerIsBetter />
        <Kpi label="Signal→text p50" value={data.latency.p50_ms} unit="ms" previous={data.latency.previous?.p50_ms} days={range.days} lowerIsBetter />
        <Kpi label="Signal→text p95" value={data.latency.p95_ms} unit="ms" previous={data.latency.previous?.p95_ms} days={range.days} lowerIsBetter />
        <Kpi label="Send failures" value={data.totals.failed} previous={data.totals.failed_previous} days={range.days} lowerIsBetter />
      </div>
      <Panel title="Signals received vs alerts sent vs suppressed" subtitle="Per day, from the rollup table">
        <TimeSeriesChart
          stacked={false}
          data={data.series}
          series={[
            { key: 'signals_received', label: 'Backend signals', color: COLORS.slate },
            { key: 'alerts_sent', label: 'Alerts sent', color: COLORS.green },
            { key: 'alerts_suppressed', label: 'Suppressed', color: COLORS.amber }
          ]}
        />
      </Panel>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Suppression reasons" actions={<CsvButton filename="kimi-suppression" rows={data.suppression} columns={[{ key: 'reason' }, { key: 'count' }, { key: 'pct' }]} />}>
          <BarList items={data.suppression.map((s) => ({ label: s.reason.replace(/_/g, ' '), value: s.count, sub: `${s.pct}%` }))} color={COLORS.amber} empty="No suppressions" />
        </Panel>
        <Panel title="Per-alert engagement" subtitle={`${e.sent} alerts sent in range`}>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Reply within 1h', e.reply_1h_pct, e.previous.reply_1h_pct],
              ['Link click-through', e.click_pct, e.previous.click_pct],
              ['Alert → backtest', e.backtest_pct, e.previous.backtest_pct],
              ['Mute or opt-out within 24h', e.mute_or_opt_out_24h_pct, e.previous.mute_or_opt_out_24h_pct, true]
            ].map(([label, v, prev, lower]) => (
              <Kpi key={label} label={label} value={v} unit="pct" previous={prev} delta={v !== null && prev ? Math.round(((v - prev) / prev) * 1000) / 10 : null} lowerIsBetter={Boolean(lower)} />
            ))}
          </div>
        </Panel>
        <DataTable
          title="Top tickers"
          rows={data.top_tickers}
          filename="kimi-alert-tickers"
          maxHeight={300}
          columns={[
            { key: 'ticker', label: 'Ticker', render: (r) => <b>${r.ticker}</b> },
            { key: 'signals', label: 'Signals', align: 'right' },
            { key: 'sent', label: 'Alerts sent', align: 'right' }
          ]}
        />
      </div>
      <DataTable
        title="Signal quality"
        subtitle="Forward returns of alerted tickers from daily closes, by backend parameter version."
        rows={data.quality}
        filename="kimi-signal-quality"
        columns={[
          { key: 'version', label: 'Backend version', render: (r) => <span className="block max-w-xs truncate" title={r.version}>{r.version}</span> },
          { key: 'signals', label: 'Signals', align: 'right' },
          { key: 't1d_n', label: 'T+1d n', align: 'right' },
          { key: 't1d_avg', label: 'T+1d avg', align: 'right', render: (r) => fmt.pct(r.t1d_avg, 2, true) },
          { key: 't1d_median', label: 'T+1d median', align: 'right', render: (r) => fmt.pct(r.t1d_median, 2, true) },
          { key: 't1d_positive_pct', label: 'T+1d up', align: 'right', render: (r) => fmt.pct(r.t1d_positive_pct) },
          { key: 't5d_n', label: 'T+5d n', align: 'right' },
          { key: 't5d_avg', label: 'T+5d avg', align: 'right', render: (r) => fmt.pct(r.t5d_avg, 2, true) },
          { key: 't5d_median', label: 'T+5d median', align: 'right', render: (r) => fmt.pct(r.t5d_median, 2, true) },
          { key: 't5d_positive_pct', label: 'T+5d up', align: 'right', render: (r) => fmt.pct(r.t5d_positive_pct) }
        ]}
      />
      <DataTable
        title="Recent alerts"
        subtitle="Click a row for the backend payload and recipients."
        rows={data.recent}
        filename="kimi-recent-alerts"
        searchKeys={['id', 'ticker', 'status']}
        onRowClick={(r) => setDrill(r.id)}
        columns={[
          { key: 'id', label: 'Signal id' },
          { key: 'status', label: 'Status' },
          { key: 'received_at', label: 'Received', render: (r) => fmt.dateTime(r.received_at) },
          { key: 'notional', label: 'Notional', align: 'right', render: (r) => fmt.usd(r.notional) },
          { key: 'volume_ratio', label: 'Vol x', align: 'right', render: (r) => (r.volume_ratio ? r.volume_ratio.toFixed(1) : '—') },
          { key: 'recipients', label: 'Evaluated', align: 'right' },
          { key: 'sent', label: 'Sent', align: 'right' },
          { key: 'suppressed', label: 'Suppressed', align: 'right' },
          { key: 'replied', label: 'Replied', align: 'right' },
          { key: 'clicked', label: 'Clicked', align: 'right' },
          { key: 'backtests', label: 'BT', align: 'right' },
          { key: 't1d', label: 'T+1d', align: 'right', render: (r) => fmt.pct(r.t1d, 2, true) },
          { key: 't5d', label: 'T+5d', align: 'right', render: (r) => fmt.pct(r.t5d, 2, true) }
        ]}
      />
      {drill && <AlertDrillIn api={api} alertId={drill} onClose={() => setDrill(null)} />}
    </div>
  );
}

function BacktestsTab({ data, range }) {
  const t = data.totals;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi label="Runs" value={t.runs} previous={t.previous.runs} delta={t.deltas.runs} days={range.days} />
        <Kpi label="Success rate" value={t.success_rate} unit="pct" previous={t.previous.success_rate} delta={t.deltas.success_rate} />
        <Kpi label="Failure rate" value={t.failure_rate} unit="pct" previous={t.previous.failure_rate} lowerIsBetter />
        <Kpi label="Median runtime" value={t.median_runtime_ms} unit="ms" previous={t.previous.median_runtime_ms} delta={t.deltas.median_runtime_ms} lowerIsBetter />
        <Kpi label="p95 runtime" value={t.p95_runtime_ms} unit="ms" previous={t.previous.p95_runtime_ms} lowerIsBetter />
      </div>
      <Panel title="Runs per day">
        <TimeSeriesChart
          data={data.series}
          series={[
            { key: 'backtests_completed', label: 'Completed', color: COLORS.green },
            { key: 'backtests_failed', label: 'Failed', color: COLORS.red }
          ]}
        />
      </Panel>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Most-tested structures" actions={<CsvButton filename="kimi-structures" rows={data.structures} columns={[{ key: 'structure' }, { key: 'tested' }, { key: 'ranked_first' }]} />}>
          <BarList items={data.structures.map((s) => ({ label: s.structure, value: s.tested }))} color={COLORS.slate} />
        </Panel>
        <Panel title="Ranked #1 most often">
          <BarList items={[...data.structures].sort((a, b) => b.ranked_first - a.ranked_first).map((s) => ({ label: s.structure, value: s.ranked_first }))} color={COLORS.green} />
        </Panel>
        <Panel title="Alert-initiated vs free-form" actions={<CsvButton filename="kimi-backtest-sources" rows={data.sources} columns={[{ key: 'source' }, { key: 'runs' }]} />}>
          <BarList items={data.sources.map((s) => ({ label: s.source === 'alert' ? 'From an alert (BT)' : s.source === 'web' ? 'Web' : 'Free-form text', value: s.runs }))} color={COLORS.violet} />
        </Panel>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Panel title="Sharpe distribution" subtitle="All structures in completed runs">
          <Histogram bins={data.distributions.sharpe} color={COLORS.blue} xLabel="Sharpe" />
        </Panel>
        <Panel title="Win rate distribution">
          <Histogram bins={data.distributions.win_rate} color={COLORS.green} xLabel="Win rate %" />
        </Panel>
        <Panel title="Average return distribution">
          <Histogram bins={data.distributions.avg_return} color={COLORS.violet} xLabel="Avg return %" />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.35fr)_minmax(0,0.65fr)]">
        <DataTable title="Most-tested tickers" rows={data.tickers} filename="kimi-backtest-tickers" maxHeight={360} columns={[{ key: 'ticker', label: 'Ticker', render: (r) => <b>${r.ticker}</b> }, { key: 'runs', label: 'Runs', align: 'right' }]} />
        <DataTable
          title="Recent runs"
          rows={data.recent}
          filename="kimi-backtests"
          searchKeys={['ticker', 'status', 'source', 'user_id']}
          maxHeight={360}
          columns={[
            { key: 'created_at', label: 'When', render: (r) => fmt.dateTime(r.created_at) },
            { key: 'ticker', label: 'Ticker', render: (r) => <b>${r.ticker}</b> },
            { key: 'source', label: 'Source' },
            { key: 'status', label: 'Status', render: (r) => (r.status === 'failed' ? <span className="text-red-600" title={r.error}>failed</span> : r.status) },
            { key: 'winner', label: '#1' },
            { key: 'sharpe', label: 'Sharpe', align: 'right' },
            { key: 'win_rate', label: 'Win %', align: 'right' },
            { key: 'runtime_ms', label: 'Runtime', align: 'right', render: (r) => fmt.ms(r.runtime_ms) },
            { key: 'user_id', label: 'User', render: (r) => <Link href={`/admin/kimi/users/${r.user_id}`} className="text-green-700 hover:underline">{r.user_id}</Link> }
          ]}
        />
      </div>
    </div>
  );
}

function ConversationsTab({ data, range, api, onChanged }) {
  const resolve = async (userId) => {
    await api('/api/admin/kimi/flags', { method: 'POST', body: { user_id: userId } });
    onChanged();
  };
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="Fallback / couldn't help" value={data.fallback.rate} unit="pct" previous={data.fallback.previous?.rate} lowerIsBetter />
        <Kpi label="Agent replies" value={data.fallback.replies} previous={data.fallback.previous?.replies} days={range.days} />
        <Kpi label="Positive feedback" value={data.feedback.positive_pct} unit="pct" previous={data.feedback.previous_positive_pct} />
        <Kpi label="Flagged conversations" value={data.flagged.length} note="open now" />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Intent breakdown" subtitle={`${data.inbound_total} inbound messages classified by the fast model`} actions={<CsvButton filename="kimi-intents" rows={data.intents} columns={[{ key: 'intent' }, { key: 'count' }, { key: 'pct' }]} />}>
          <BarList items={data.intents.map((i) => ({ label: i.intent.replace(/_/g, ' '), value: i.count, sub: `${i.pct ?? 0}%` }))} color={COLORS.blue} />
          {data.handled_before_agent?.length > 0 && (
            <p className="mt-4 text-xs text-gray-500">Handled before the agent: {data.handled_before_agent.map((h) => `${h.kind.replace(/_/g, ' ')} ${h.count}`).join(', ')}.</p>
          )}
        </Panel>
        <DataTable
          title="Tool calls"
          subtitle="Frequency, error rate and latency"
          rows={data.tools}
          filename="kimi-tool-calls"
          columns={[
            { key: 'tool', label: 'Tool' },
            { key: 'calls', label: 'Calls', align: 'right' },
            { key: 'errors', label: 'Errors', align: 'right' },
            { key: 'error_rate', label: 'Error rate', align: 'right', render: (r) => fmt.pct(r.error_rate) },
            { key: 'p50_ms', label: 'p50', align: 'right', render: (r) => fmt.ms(r.p50_ms) }
          ]}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <DataTable
          title="Flagged conversations"
          subtitle="Errors, user frustration, boundary requests and thumbs-down feedback."
          rows={data.flagged}
          filename="kimi-flagged"
          columns={[
            { key: 'user_id', label: 'User', render: (r) => <Link href={`/admin/kimi/users/${r.user_id}`} className="text-green-700 hover:underline">{r.phone_masked || r.user_id}</Link> },
            { key: 'reasons', label: 'Reasons', render: (r) => r.reasons.map((x) => x.replace(/_/g, ' ')).join(', '), csv: (r) => r.reasons.join('|') },
            { key: 'flagged_at', label: 'Flagged', render: (r) => fmt.dateTime(r.flagged_at) },
            { key: 'resolve', label: '', render: (r) => <button type="button" onClick={(ev) => { ev.stopPropagation(); resolve(r.user_id); }} className="rounded-md border border-gray-200 px-2 py-0.5 text-xs hover:bg-gray-50">Mark reviewed</button>, csv: () => '' }
          ]}
          empty="Nothing flagged"
        />
        <DataTable
          title="User feedback"
          subtitle={`${data.feedback.up} helpful, ${data.feedback.down} not helpful`}
          rows={data.feedback.recent}
          filename="kimi-feedback"
          columns={[
            { key: 'at', label: 'When', render: (r) => fmt.dateTime(r.at) },
            { key: 'rating', label: 'Rating', render: (r) => (r.rating === 'up' ? <span className="text-green-700">Helpful</span> : <span className="text-red-600">Not helpful</span>), csv: (r) => r.rating },
            { key: 'comment', label: 'Comment' },
            { key: 'user_id', label: 'User', render: (r) => <Link href={`/admin/kimi/users/${r.user_id}`} className="text-green-700 hover:underline">{r.user_id}</Link> }
          ]}
          empty="No feedback yet"
        />
      </div>
    </div>
  );
}

function UsersTab({ data }) {
  const router = useRouter();
  return (
    <DataTable
      title={`Users (${data.users.length})`}
      subtitle="Messages, alerts, backtests and cost are for the selected range. Phones are masked."
      rows={data.users}
      filename="kimi-users"
      searchKeys={['phone_masked', 'email', 'user_id', 'plan']}
      onRowClick={(r) => router.push(`/admin/kimi/users/${r.user_id}`)}
      maxHeight={640}
      columns={[
        { key: 'phone_masked', label: 'Phone', render: (r) => r.phone_masked || <span className="text-gray-400">not verified</span> },
        { key: 'email', label: 'Email' },
        { key: 'plan', label: 'Plan' },
        { key: 'signup_at', label: 'Signup', render: (r) => fmt.date(r.signup_at) },
        { key: 'last_active_at', label: 'Last active', render: (r) => fmt.dateTime(r.last_active_at) },
        { key: 'messages', label: 'Messages', align: 'right' },
        { key: 'alerts_received', label: 'Alerts', align: 'right' },
        { key: 'backtests', label: 'Backtests', align: 'right' },
        { key: 'opted_out', label: 'Status', render: (r) => (r.opted_out ? <span className="text-red-600">opted out</span> : r.paused ? 'paused' : r.verified ? 'active' : 'unverified'), csv: (r) => (r.opted_out ? 'opted_out' : r.paused ? 'paused' : r.verified ? 'active' : 'unverified') },
        { key: 'cost_usd', label: 'Cost', align: 'right', render: (r) => `$${r.cost_usd.toFixed(3)}` }
      ]}
    />
  );
}

function HealthTab({ data, range, api, onChanged, filters }) {
  const [busy, setBusy] = useState(false);
  const rebuild = async () => {
    setBusy(true);
    await api('/api/admin/kimi/rollups', { method: 'POST', body: { from: filters.from, to: filters.to } }).catch(() => {});
    setBusy(false);
    onChanged();
  };
  const q = data.queue;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Kpi label="Queue depth" value={q.queued + q.processing} note="live now" />
        <Kpi label="Dead jobs" value={q.dead} note="live now" />
        <Kpi label="Webhook rejections" value={data.webhooks.rejected} previous={data.previous?.webhook_rejected} days={range.days} lowerIsBetter />
        <Kpi label="LLM errors + timeouts" value={data.llm.errors + data.llm.timeouts} previous={data.previous?.llm_failures} days={range.days} lowerIsBetter />
        <Kpi label="LLM error rate" value={data.llm.error_rate} unit="pct" previous={data.previous?.llm_error_rate} lowerIsBetter />
        <Kpi label="Agent errors" value={data.llm.agent_errors} previous={data.previous?.agent_errors} days={range.days} lowerIsBetter />
      </div>
      <div className="grid gap-5 xl:grid-cols-3">
        <Panel title="Latency percentiles">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            {[
              ['Reply p50', data.latency.reply_p50_ms],
              ['Reply p95', data.latency.reply_p95_ms],
              ['Reply p99', data.latency.reply_p99_ms],
              ['LLM call p50', data.llm.p50_ms],
              ['LLM call p95', data.llm.p95_ms],
              ['Backtest p50', data.latency.backtest_p50_ms],
              ['Backtest p95', data.latency.backtest_p95_ms]
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                <dt className="text-xs text-gray-500">{k}</dt>
                <dd className="font-mono font-bold text-gray-900">{fmt.ms(v)}</dd>
              </div>
            ))}
          </dl>
        </Panel>
        <DataTable
          title="Send failures by provider error code"
          rows={data.send_failures}
          filename="kimi-send-failures"
          maxHeight={260}
          columns={[
            { key: 'provider', label: 'Provider' },
            { key: 'error_code', label: 'Error code' },
            { key: 'count', label: 'Count', align: 'right' }
          ]}
          empty="No send failures"
        />
        <Panel title="Jobs and storage">
          <dl className="space-y-1.5 text-sm">
            {[
              ['Store', data.store.mode],
              ['Queued / processing', `${q.queued} / ${q.processing}`],
              ['Oldest queued', fmt.dateTime(q.oldest_queued_at)],
              ['Last tick', fmt.dateTime(data.last_tick_at)],
              ['Last tick errors', data.last_tick?.errors?.length ? data.last_tick.errors.join(', ') : 'none'],
              ['Last rollup', fmt.dateTime(data.last_rollup_at)],
              ['Webhooks received', fmt.num(data.webhooks.received)]
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-gray-500">{k}</dt>
                <dd className="font-mono text-gray-900">{v}</dd>
              </div>
            ))}
          </dl>
          <button type="button" onClick={rebuild} disabled={busy} className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50">
            <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} /> Rebuild rollups for range
          </button>
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <Panel title="Cost per day" subtitle={`LLM $${data.cost.totals.llm_cost_usd.toFixed(2)} · messaging $${data.cost.totals.messaging_cost_usd.toFixed(2)} · spend alert at $${data.cost.spend_alert_threshold_usd}/day`}>
          <TimeSeriesChart
            data={data.cost.series}
            format={(v) => `$${v.toFixed(v < 10 ? 2 : 0)}`}
            series={[
              { key: 'llm_cost_usd', label: 'LLM', color: COLORS.violet },
              { key: 'messaging_cost_usd', label: 'Messaging', color: COLORS.teal }
            ]}
          />
        </Panel>
        <Panel title="Tokens per day" subtitle={`${fmt.num(data.cost.totals.tokens)} tokens in range`}>
          <TimeSeriesChart data={data.cost.series} format={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(Math.round(v)))} series={[{ key: 'tokens', label: 'Tokens', color: COLORS.slate }]} />
        </Panel>
      </div>
      <div className="grid gap-5 xl:grid-cols-2">
        <DataTable
          title="Cost per user"
          rows={data.cost.per_user}
          filename="kimi-cost-per-user"
          columns={[
            { key: 'user_id', label: 'User', render: (r) => <Link href={`/admin/kimi/users/${r.user_id}`} className="text-green-700 hover:underline">{r.phone_masked || r.user_id}</Link> },
            { key: 'tokens', label: 'Tokens', align: 'right', render: (r) => fmt.num(r.tokens) },
            { key: 'llm_cost_usd', label: 'LLM $', align: 'right', render: (r) => r.llm_cost_usd.toFixed(3) },
            { key: 'messaging_cost_usd', label: 'Messaging $', align: 'right', render: (r) => r.messaging_cost_usd.toFixed(3) },
            { key: 'total_usd', label: 'Total $', align: 'right', render: (r) => r.total_usd.toFixed(3) }
          ]}
        />
        <DataTable
          title="Admin audit log"
          subtitle="Transcript views, exports and switch changes"
          rows={data.audit}
          filename="kimi-audit"
          columns={[
            { key: 'at', label: 'When', render: (r) => fmt.dateTime(r.at) },
            { key: 'actor', label: 'Admin' },
            { key: 'action', label: 'Action' },
            { key: 'target_user_id', label: 'User' }
          ]}
          empty="No admin actions yet"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Switches and filters
// ---------------------------------------------------------------------------

function Switches({ api }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api('/api/admin/kimi/switches').then(setState).catch(() => {}), [api]);
  useEffect(() => {
    load();
  }, [load]);
  const change = async (patch, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      setState(await api('/api/admin/kimi/switches', { method: 'POST', body: patch }));
    } finally {
      setBusy(false);
    }
  };
  if (!state) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => change({ alerts_enabled: !state.alerts_enabled }, state.alerts_enabled ? 'Stop all alert sends now?' : 'Turn alert sends back on?')}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold ${state.alerts_enabled ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-red-600 text-white hover:bg-red-700'}`}
        title={`Env default: ${state.env.alerts_enabled ? 'on' : 'off'}${state.overrides.alerts_enabled !== null ? ' · dashboard override active' : ''}`}
      >
        <Power className="h-3.5 w-3.5" /> Alerts {state.alerts_enabled ? 'ON' : 'OFF (kill switch)'}
      </button>
      <button
        type="button"
        disabled={busy || state.env.dry_run}
        onClick={() => change({ dry_run: !state.dry_run }, state.dry_run ? 'Turn dry run off? Kaia will send real texts.' : 'Turn dry run on? Kaia will stop texting.')}
        className={`rounded-lg px-3 py-1.5 text-xs font-bold ${state.dry_run ? 'bg-amber-100 text-amber-800' : 'bg-gray-900 text-white'} disabled:cursor-not-allowed`}
        title={state.env.dry_run ? 'KIMI_DRY_RUN=true in the environment; it cannot be turned off from here.' : 'Toggle dry run'}
      >
        Dry run {state.dry_run ? 'ON' : 'OFF'}
        {state.env.dry_run ? ' (env)' : ''}
      </button>
    </div>
  );
}

function Filters({ filters, onChange }) {
  const [ticker, setTicker] = useState(filters.ticker);
  useEffect(() => setTicker(filters.ticker), [filters.ticker]);
  const preset = (days) => onChange({ from: shiftDay(etToday(), -(days - 1)), to: etToday() });
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm">
      <label className="text-xs text-gray-600">
        From
        <input type="date" value={filters.from} max={filters.to} onChange={(e) => onChange({ from: e.target.value })} className={`${inputCls} mt-0.5 block`} />
      </label>
      <label className="text-xs text-gray-600">
        To
        <input type="date" value={filters.to} min={filters.from} max={etToday()} onChange={(e) => onChange({ to: e.target.value })} className={`${inputCls} mt-0.5 block`} />
      </label>
      <div className="flex gap-1">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => preset(d)} className="rounded-md border border-gray-200 px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            {d}d
          </button>
        ))}
      </div>
      <label className="text-xs text-gray-600">
        Channel
        <select value={filters.channel} onChange={(e) => onChange({ channel: e.target.value })} className={`${inputCls} mt-0.5 block`}>
          <option value="all">All channels</option>
          <option value="imessage">iMessage</option>
          <option value="sms">SMS</option>
          <option value="web">Web</option>
        </select>
      </label>
      <label className="text-xs text-gray-600">
        Plan
        <select value={filters.plan} onChange={(e) => onChange({ plan: e.target.value })} className={`${inputCls} mt-0.5 block`}>
          <option value="all">All plans</option>
          <option value="pro">Pro</option>
          <option value="free">Free</option>
        </select>
      </label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onChange({ ticker: ticker.replace(/^\$/, '').toUpperCase() });
        }}
        className="text-xs text-gray-600"
      >
        Ticker
        <div className="mt-0.5 flex gap-1">
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} onBlur={() => onChange({ ticker: ticker.replace(/^\$/, '').toUpperCase() })} placeholder="Any" className={`${inputCls} w-24`} />
          {filters.ticker && (
            <button type="button" onClick={() => onChange({ ticker: '' })} className="rounded-md border border-gray-200 px-2 text-gray-500 hover:bg-gray-50" aria-label="Clear ticker">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function KimiAdmin() {
  const router = useRouter();
  const { api, ready, signedIn, devBypass } = useKimiApi({ admin: true });
  const today = etToday();
  const filters = {
    tab: ADMIN_TABS.some(([id]) => id === router.query.tab) ? router.query.tab : 'overview',
    from: typeof router.query.from === 'string' ? router.query.from : shiftDay(today, -29),
    to: typeof router.query.to === 'string' ? router.query.to : today,
    channel: typeof router.query.channel === 'string' ? router.query.channel : 'all',
    plan: typeof router.query.plan === 'string' ? router.query.plan : 'all',
    ticker: typeof router.query.ticker === 'string' ? router.query.ticker : ''
  };
  const key = JSON.stringify(filters);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  const update = (patch) => {
    const next = { ...filters, ...patch };
    const query = Object.fromEntries(Object.entries(next).filter(([k, v]) => v && !(k === 'channel' && v === 'all') && !(k === 'plan' && v === 'all')));
    router.replace({ pathname: '/admin/kimi', query }, undefined, { shallow: true });
  };

  useEffect(() => {
    if (!router.isReady || !ready || !signedIn) return undefined;
    let cancelled = false;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ tab: filters.tab, from: filters.from, to: filters.to, channel: filters.channel, plan: filters.plan, ticker: filters.ticker });
    api(`/api/admin/kimi/dashboard?${qs}`)
      .then((res) => !cancelled && setResult(res))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, router.isReady, ready, signedIn, api, version]);

  const refresh = () => setVersion((v) => v + 1);
  const data = result?.tab === filters.tab ? result.data : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Kaia admin · KAHF Capital</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />
      <main className="mx-auto max-w-[1400px] px-4 py-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700">Admin</p>
            <h1 className="text-3xl font-black tracking-tight text-gray-900">Kaia usage</h1>
            {result?.admin?.email && <p className="mt-0.5 text-xs text-gray-500">Signed in as {result.admin.email}</p>}
          </div>
          {signedIn && <Switches api={api} />}
        </div>
        {devBypass && <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">Development mode: admin access is granted locally. Production requires an ADMIN_EMAILS login.</div>}
        {!ready ? (
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        ) : !signedIn ? (
          <div className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center">
            <ShieldAlert className="mx-auto h-6 w-6 text-amber-600" />
            <h2 className="mt-2 font-bold text-gray-900">Admins only</h2>
            <p className="mt-1 text-sm text-gray-600">Sign in with an email listed in ADMIN_EMAILS.</p>
            <Link href="/login?redirect=/admin/kimi" className="mt-4 inline-block rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white">
              Sign in
            </Link>
          </div>
        ) : (
          <div className="space-y-5">
            <Filters filters={filters} onChange={update} />
            <nav className="flex flex-wrap gap-1.5">
              {ADMIN_TABS.map(([id, label]) => (
                <button key={id} type="button" onClick={() => update({ tab: id })} className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${filters.tab === id ? 'bg-gray-900 text-white' : 'border border-gray-200 bg-white text-gray-700 hover:bg-gray-100'}`}>
                  {label}
                </button>
              ))}
              {loading && <Loader2 className="ml-2 h-5 w-5 animate-spin self-center text-gray-400" />}
            </nav>
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
            {data && (
              <>
                {filters.tab === 'overview' && <OverviewTab data={data} range={result.range} />}
                {filters.tab === 'funnel' && <FunnelTab data={data} />}
                {filters.tab === 'alerts' && <AlertsTab data={data} range={result.range} api={api} />}
                {filters.tab === 'backtests' && <BacktestsTab data={data} range={result.range} />}
                {filters.tab === 'conversations' && <ConversationsTab data={data} range={result.range} api={api} onChanged={refresh} />}
                {filters.tab === 'users' && <UsersTab data={data} />}
                {filters.tab === 'health' && <HealthTab data={data} range={result.range} api={api} onChanged={refresh} filters={filters} />}
                <p className="text-xs text-gray-400">
                  {result.range.fromDay} to {result.range.toDay} (ET) · compared with {result.range.prevFromDay} to {result.range.prevToDay} · generated {fmt.dateTime(result.generated_at)}
                </p>
              </>
            )}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
