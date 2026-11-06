import React from 'react';

// Growth of $100k with a flat $5k in every read: realized P/L lands on the
// exit date — expiration for calls/puts, the take-profit/stop-loss date for
// managed straddles (step-forward — nothing is known before the exit); open
// reads are added as one final marked-to-market point at today.
function buildEquityCurve(alerts) {
  const START = 100000;
  const PER_POSITION = 5000;

  const scored = alerts.filter((a) => a.result !== 'flat');
  const realized = scored.filter(
    (a) => (a.status === 'settled' && a.expiration) || (a.status === 'closed' && (a.exit_date || a.expiration))
  );
  const open = scored.filter((a) => a.status === 'open');
  if (realized.length === 0) return null;

  const pnlByExit = {};
  for (const a of realized) {
    const exitDate = a.status === 'closed' ? (a.exit_date || a.expiration) : a.expiration;
    pnlByExit[exitDate] = (pnlByExit[exitDate] || 0) + PER_POSITION * (a.estimated_return_pct / 100);
  }

  const firstSignal = alerts.reduce((m, a) => (a.date < m ? a.date : m), '9999-12-31');
  const points = [{ date: firstSignal, value: START, open: false }];
  let equity = START;
  for (const d of Object.keys(pnlByExit).sort()) {
    equity += pnlByExit[d];
    points.push({ date: d, value: equity, open: false });
  }

  const openPnl = open.reduce((s, a) => s + PER_POSITION * (a.estimated_return_pct / 100), 0);
  if (open.length > 0) {
    points.push({ date: new Date().toISOString().slice(0, 10), value: equity + openPnl, open: true });
  }

  return { points, settledEquity: equity, openCount: open.length, perPosition: PER_POSITION, start: START };
}

export default function GrowthChart({ alerts, kicker = null, className = 'mb-10' }) {
  const curve = buildEquityCurve(alerts);
  if (!curve || curve.points.length < 2) return null;

  const { points, start } = curve;
  const W = 800;
  const H = 240;
  const PAD = { top: 14, right: 14, bottom: 26, left: 62 };

  const t0 = new Date(`${points[0].date}T00:00:00`).getTime();
  const t1 = new Date(`${points[points.length - 1].date}T00:00:00`).getTime();
  const values = points.map((p) => p.value).concat(start);
  const vMin = Math.min(...values);
  const vMax = Math.max(...values);
  const span = Math.max(vMax - vMin, 1) * 0.08;
  const yLo = vMin - span;
  const yHi = vMax + span;

  const x = (d) => PAD.left + ((new Date(`${d}T00:00:00`).getTime() - t0) / Math.max(t1 - t0, 1)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - (v - yLo) / (yHi - yLo)) * (H - PAD.top - PAD.bottom);

  const coords = points.map((p) => ({ px: x(p.date), py: y(p.value), open: p.open }));
  const lastSettledIdx = points[points.length - 1].open ? coords.length - 2 : coords.length - 1;
  const solidPath = coords.slice(0, lastSettledIdx + 1).map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ');
  const dashedPath = points[points.length - 1].open
    ? `M${coords[lastSettledIdx].px.toFixed(1)},${coords[lastSettledIdx].py.toFixed(1)} L${coords[coords.length - 1].px.toFixed(1)},${coords[coords.length - 1].py.toFixed(1)}`
    : null;
  const areaPath = `${coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.px.toFixed(1)},${c.py.toFixed(1)}`).join(' ')} L${coords[coords.length - 1].px.toFixed(1)},${(H - PAD.bottom).toFixed(1)} L${coords[0].px.toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

  const finalValue = points[points.length - 1].value;
  const totalReturnPct = ((finalValue - start) / start) * 100;
  const up = finalValue >= start;
  const money = (v) => Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
  const fmtDate = (d) => new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const gridValues = [start, yHi - span, yLo + span].filter((v, i, arr) => arr.findIndex((o) => Math.abs(o - v) < (yHi - yLo) * 0.06) === i);

  return (
    <div className={`bg-white border border-gray-200 rounded-2xl overflow-hidden ${className}`}>
      <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          {kicker && (
            <p className="text-xs font-semibold uppercase tracking-wider text-green-700 mb-1">{kicker}</p>
          )}
          <h2 className="font-bold text-gray-900">Growth of $100,000</h2>
        </div>
        <div className="text-sm">
          <span className={`font-mono font-bold ${up ? 'text-green-600' : 'text-red-500'}`}>{money(finalValue)}</span>
          <span className={`ml-2 font-mono ${up ? 'text-green-600' : 'text-red-500'}`}>
            ({totalReturnPct >= 0 ? '+' : ''}{totalReturnPct.toFixed(1)}%)
          </span>
        </div>
      </div>
      <div className="px-2 pt-4 pb-2 sm:px-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Hypothetical growth of $100,000 investing $5,000 per read: currently ${money(finalValue)}`}>
          {gridValues.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="#e5e7eb" strokeWidth="1" strokeDasharray={v === start ? '4 4' : undefined} />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="#9ca3af" fontFamily="ui-monospace, monospace">
                {Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 0 }).format(v)}
              </text>
            </g>
          ))}
          <path d={areaPath} fill={up ? 'rgba(22,163,74,0.08)' : 'rgba(239,68,68,0.08)'} />
          <path d={solidPath} fill="none" stroke={up ? '#16a34a' : '#ef4444'} strokeWidth="2.5" strokeLinejoin="round" />
          {dashedPath && (
            <path d={dashedPath} fill="none" stroke={up ? '#16a34a' : '#ef4444'} strokeWidth="2.5" strokeDasharray="6 5" strokeLinejoin="round" />
          )}
          {coords.map((c, i) => (
            <circle key={i} cx={c.px} cy={c.py} r={i === coords.length - 1 ? 4 : 2.5} fill={up ? '#16a34a' : '#ef4444'} />
          ))}
          <text x={PAD.left} y={H - 8} fontSize="11" fill="#9ca3af">{fmtDate(points[0].date)}</text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="11" fill="#9ca3af">{fmtDate(points[points.length - 1].date)}</text>
        </svg>
      </div>
      <p className="px-6 pb-4 text-[11px] text-gray-400 leading-relaxed">
        Hypothetical: $5,000 allocated to every read at signal. Calls and puts held to expiry; straddles exit at +40% take-profit or −30% stop-loss. Each step is an exit date.
        {curve.openCount > 0 && ' Dashed segment adds the current mark-to-market value of open positions.'}
        {' '}Not live-traded; excludes commissions and slippage.
      </p>
    </div>
  );
}
