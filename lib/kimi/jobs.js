// Scheduled work, called by /api/kimi/jobs/tick (every few minutes) and
// /api/kimi/jobs/rollup (daily). Each step is isolated so one failure doesn't
// block the rest; failures are recorded as `job_error` events.

import { addDays, usageDay, clockNow } from './runtime.js';
import { drainInboundJobs } from './queue.js';
import { flushDigests, pollSignals, updateForwardReturns } from './alert-engine.js';
import { sweepBacktests } from './backtests.js';
import { checkGlobalSpend } from './spend.js';
import { buildRollups } from './analytics.js';
import { emitEvent, getSystemState, updateSystemMeta } from './store.js';

const FORWARD_RETURNS_EVERY_MS = 30 * 60 * 1000;

export async function runTick({ now = clockNow() } = {}) {
  const out = { at: now.toISOString() };
  const step = async (name, fn) => {
    const started = Date.now();
    try {
      out[name] = await fn();
    } catch (err) {
      out[name] = { error: String(err.message || err).slice(0, 300) };
      await emitEvent('job_error', { properties: { step: name, error: out[name].error } });
    }
    out[`${name}_ms`] = Date.now() - started;
  };

  await step('inbound', () => drainInboundJobs({ now }));
  await step('signals', () => pollSignals({ now }));
  await step('digests', () => flushDigests({ now }));
  await step('backtests', () => sweepBacktests({ now }));
  const sys = await getSystemState();
  if (!sys.last_forward_returns_at || now - new Date(sys.last_forward_returns_at) > FORWARD_RETURNS_EVERY_MS) {
    await step('forward_returns', () => updateForwardReturns({ now }));
    await updateSystemMeta({ last_forward_returns_at: now.toISOString() });
  }
  await step('spend', () => checkGlobalSpend(now));
  await updateSystemMeta({
    last_tick_at: now.toISOString(),
    last_tick: {
      signals_new: out.signals?.new ?? null,
      sent: out.signals?.sent ?? null,
      suppressed: out.signals?.suppressed ?? null,
      digests_sent: out.digests?.sent ?? null,
      inbound_drained: out.inbound?.processed ?? null,
      errors: Object.entries(out).filter(([, v]) => v && v.error).map(([k]) => k)
    }
  });
  return out;
}

export async function runRollups({ from = null, to = null, now = clockNow() } = {}) {
  const today = usageDay(now);
  const toDay = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? to : today;
  const fromDay = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? from : addDays(toDay, -2);
  return buildRollups({ fromDay, toDay });
}
