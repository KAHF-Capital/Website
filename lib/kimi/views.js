// Response shapes shared by the user-facing API routes.

export function alertSummary(alert, delivery) {
  const s = alert?.signal_payload || {};
  return {
    alert_id: alert.id,
    ticker: alert.ticker,
    status: alert.status,
    signal_date: alert.signal_date || s.date || null,
    signal_at: alert.signal_at || null,
    sent_at: delivery?.sent_at || null,
    digest: Boolean(delivery?.digest),
    dry_run: Boolean(delivery?.dry_run),
    notional: s.dark_pool_value ?? null,
    avg_price: s.dark_pool_avg_price ?? null,
    volume_ratio: s.volume_ratio ?? null,
    structure: s.structure || null,
    strike: s.strike ?? null,
    expiration: s.expiration || null,
    entry_premium: s.entry_premium ?? null,
    hit_rate: s.asof_hit_rate ?? null,
    forward_returns: alert.forward_returns || null,
    backtest_job_id: delivery?.backtest_job_id || null
  };
}
