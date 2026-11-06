import React from 'react';

// Dependency-free SVG/HTML charts for Kimi, matching the site's other charts.

export const COLORS = {
  green: '#16a34a',
  emerald: '#34d399',
  slate: '#334155',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  violet: '#8b5cf6',
  teal: '#14b8a6',
  gray: '#9ca3af'
};

function niceMax(v) {
  if (!(v > 0)) return 1;
  const exp = 10 ** Math.floor(Math.log10(v));
  const f = v / exp;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
}

const shortDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function Legend({ series }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
      {series.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

export function EmptyChart({ label = 'No data for this range', height = 160 }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-400" style={{ height }}>
      {label}
    </div>
  );
}

/** Daily stacked (or grouped) bars. data: [{ day, [key]: number }] */
export function TimeSeriesChart({ data = [], series, stacked = true, height = 220, format = (v) => String(v) }) {
  if (!data.length || data.every((d) => series.every((s) => !d[s.key]))) return <EmptyChart height={height} />;
  const W = 760;
  const H = height;
  const P = { t: 10, r: 8, b: 26, l: 46 };
  const innerW = W - P.l - P.r;
  const innerH = H - P.t - P.b;
  const totals = data.map((d) => (stacked ? series.reduce((s, x) => s + (d[x.key] || 0), 0) : Math.max(...series.map((x) => d[x.key] || 0))));
  const max = niceMax(Math.max(...totals));
  const slot = innerW / data.length;
  const barW = Math.max(1.5, slot * 0.72);
  const y = (v) => P.t + innerH - (v / max) * innerH;
  const every = Math.max(1, Math.ceil(data.length / 8));
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={P.l} x2={W - P.r} y1={y(max * f)} y2={y(max * f)} stroke="#e5e7eb" strokeDasharray={f ? '3 3' : undefined} />
            <text x={P.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
              {format(max * f)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x0 = P.l + i * slot + (slot - barW) / 2;
          let acc = 0;
          return (
            <g key={d.day}>
              {series.map((s, j) => {
                const v = d[s.key] || 0;
                if (!v) return null;
                if (stacked) {
                  const top = y(acc + v);
                  const h = y(acc) - top;
                  acc += v;
                  return (
                    <rect key={s.key} x={x0} y={top} width={barW} height={Math.max(h, 0.5)} fill={s.color} rx="1">
                      <title>{`${shortDay(d.day)} · ${s.label}: ${format(v)}`}</title>
                    </rect>
                  );
                }
                const w = barW / series.length;
                return (
                  <rect key={s.key} x={x0 + j * w} y={y(v)} width={Math.max(w - 0.5, 1)} height={Math.max(y(0) - y(v), 0.5)} fill={s.color} rx="1">
                    <title>{`${shortDay(d.day)} · ${s.label}: ${format(v)}`}</title>
                  </rect>
                );
              })}
              {i % every === 0 && (
                <text x={x0 + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#9ca3af">
                  {shortDay(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <Legend series={series} />
    </div>
  );
}

/** Horizontal bars. items: [{ label, value, sub? }] */
export function BarList({ items = [], color = COLORS.green, format = (v) => String(v), empty = 'Nothing yet' }) {
  if (!items.length) return <EmptyChart label={empty} height={96} />;
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item.label} className="text-sm">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate font-medium text-gray-800">{item.label}</span>
            <span className="shrink-0 font-mono text-xs text-gray-600">
              {format(item.value)}
              {item.sub ? <span className="ml-1.5 text-gray-400">{item.sub}</span> : null}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100">
            <div className="h-2 rounded-full" style={{ width: `${Math.max((item.value / max) * 100, item.value ? 2 : 0)}%`, background: item.color || color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Vertical histogram. bins: [{ label, count }] */
export function Histogram({ bins = [], color = COLORS.blue, height = 160, xLabel = '' }) {
  if (!bins.some((b) => b.count)) return <EmptyChart height={height} />;
  const W = 360;
  const H = height;
  const P = { t: 8, r: 6, b: 34, l: 30 };
  const max = niceMax(Math.max(...bins.map((b) => b.count)));
  const slot = (W - P.l - P.r) / bins.length;
  const y = (v) => P.t + (H - P.t - P.b) - (v / max) * (H - P.t - P.b);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
      <text x={P.l - 4} y={y(max) + 4} textAnchor="end" fontSize="10" fill="#9ca3af">
        {max}
      </text>
      <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} stroke="#e5e7eb" />
      {bins.map((b, i) => (
        <g key={b.label}>
          <rect x={P.l + i * slot + 2} y={y(b.count)} width={slot - 4} height={y(0) - y(b.count)} fill={color} rx="2">
            <title>{`${b.label}: ${b.count}`}</title>
          </rect>
          <text x={P.l + i * slot + slot / 2} y={H - 20} textAnchor="middle" fontSize="9" fill="#6b7280">
            {b.lo}
          </text>
        </g>
      ))}
      <text x={W / 2} y={H - 4} textAnchor="middle" fontSize="10" fill="#9ca3af">
        {xLabel}
      </text>
    </svg>
  );
}

/** Funnel steps: [{ label, count, pct_of_start, pct_of_previous }] */
export function Funnel({ steps = [] }) {
  if (!steps.length || !steps[0].count) return <EmptyChart label="No signups in this range" height={120} />;
  return (
    <ol className="space-y-2.5">
      {steps.map((s, i) => (
        <li key={s.key}>
          <div className="mb-1 flex items-baseline justify-between text-sm">
            <span className="font-medium text-gray-800">
              {i + 1}. {s.label}
            </span>
            <span className="font-mono text-xs text-gray-600">
              {s.count} · {s.pct_of_start ?? 0}%{i > 0 && <span className="ml-1.5 text-gray-400">({s.pct_of_previous ?? 0}% of prev)</span>}
            </span>
          </div>
          <div className="h-6 rounded-md bg-gray-100">
            <div className="h-6 rounded-md bg-gradient-to-r from-green-600 to-emerald-400" style={{ width: `${Math.max(s.pct_of_start || 0, s.count ? 1.5 : 0)}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Weekly cohort retention heatmap. cohorts: [{ week, size, retention: [pct|null] }] */
export function CohortGrid({ cohorts = [], weeks = 8 }) {
  if (!cohorts.length) return <EmptyChart label="No cohorts yet" height={120} />;
  const shade = (v) => (v === null || v === undefined ? 'transparent' : `rgba(22, 163, 74, ${0.08 + (v / 100) * 0.8})`);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-500">
            <th className="px-2 py-1.5 text-left font-semibold">Signup week</th>
            <th className="px-2 py-1.5 text-right font-semibold">Users</th>
            {Array.from({ length: weeks }, (_, k) => (
              <th key={k} className="px-2 py-1.5 text-center font-semibold">
                W{k}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cohorts.map((c) => (
            <tr key={c.week} className="border-t border-gray-100">
              <td className="whitespace-nowrap px-2 py-1.5 font-medium text-gray-800">{shortDay(c.week)}</td>
              <td className="px-2 py-1.5 text-right font-mono text-gray-600">{c.size}</td>
              {Array.from({ length: weeks }, (_, k) => {
                const v = c.retention[k];
                return (
                  <td key={k} className="px-1 py-1">
                    <div
                      className={`rounded px-1.5 py-1 text-center font-mono ${v === undefined ? 'text-gray-200' : v > 55 ? 'text-white' : 'text-gray-800'}`}
                      style={{ background: shade(v) }}
                    >
                      {v === undefined ? '·' : v === null ? '—' : `${Math.round(v)}%`}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Multi-line equity chart. series: [{ key, label, color, points: [{ date, equity }] }] */
export function EquityChart({ series = [], baseline = 100000, height = 260 }) {
  const all = series.flatMap((s) => s.points || []);
  if (all.length < 2) return <EmptyChart label="No trades to chart" height={height} />;
  const W = 760;
  const H = height;
  const P = { t: 12, r: 12, b: 26, l: 62 };
  const times = all.map((p) => new Date(`${p.date}T12:00:00Z`).getTime());
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const values = all.map((p) => p.equity).concat(baseline);
  const pad = Math.max((Math.max(...values) - Math.min(...values)) * 0.08, 500);
  const lo = Math.min(...values) - pad;
  const hi = Math.max(...values) + pad;
  const x = (d) => P.l + ((new Date(`${d}T12:00:00Z`).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - P.l - P.r);
  const y = (v) => P.t + (1 - (v - lo) / (hi - lo)) * (H - P.t - P.b);
  const money = (v) => `$${Math.round(v / 1000)}k`;
  const firstDate = all.reduce((m, p) => (p.date < m ? p.date : m), all[0].date);
  const lastDate = all.reduce((m, p) => (p.date > m ? p.date : m), all[0].date);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img">
        {[lo + pad, baseline, hi - pad].map((v) => (
          <g key={v}>
            <line x1={P.l} x2={W - P.r} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeDasharray={v === baseline ? undefined : '3 3'} />
            <text x={P.l - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af">
              {money(v)}
            </text>
          </g>
        ))}
        {series.map((s) => (
          <path
            key={s.key}
            d={(s.points || []).map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ')}
            fill="none"
            stroke={s.color}
            strokeWidth={s.emphasis ? 2.75 : 1.75}
            strokeOpacity={s.emphasis === false ? 0.45 : 1}
            strokeLinejoin="round"
          />
        ))}
        <text x={P.l} y={H - 6} fontSize="11" fill="#9ca3af">
          {shortDay(firstDate)} {firstDate.slice(0, 4)}
        </text>
        <text x={W - P.r} y={H - 6} textAnchor="end" fontSize="11" fill="#9ca3af">
          {shortDay(lastDate)} {lastDate.slice(0, 4)}
        </text>
      </svg>
      <Legend series={series} />
    </div>
  );
}
