// GET  /api/kimi/backtests            -> the signed-in user's backtests
// POST /api/kimi/backtests { config } -> start one (e.g. "Backtest this" on an alert)

import { allowMethods, requireUser, sendError } from '../../../../lib/kimi/auth.js';
import { runBacktestJob, submitBacktest } from '../../../../lib/kimi/backtests.js';
import { loadProfileForUser } from '../../../../lib/kimi/onboarding.js';
import { queryBacktests } from '../../../../lib/kimi/store.js';
import { waitUntil } from '../../../../lib/kimi/runtime.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    const user = await requireUser(req);
    if (req.method === 'GET') {
      const jobs = await queryBacktests({ userId: user.uid });
      return res.status(200).json({
        backtests: jobs.slice(0, 50).map((j) => ({
          id: j.id,
          ticker: j.ticker,
          source: j.source,
          status: j.status,
          structures: j.structures,
          rank_by: j.rank_by,
          winner: j.winner || null,
          summary_metrics: j.summary_metrics || null,
          error: j.error || null,
          created_at: j.created_at
        }))
      });
    }
    await loadProfileForUser(user);
    const config = req.body?.config || {};
    const { job, ack } = await submitBacktest({ userId: user.uid, request: config, source: config.alert_id ? 'alert' : 'web', channel: 'web' });
    waitUntil(runBacktestJob(job.id));
    return res.status(202).json({ job_id: job.id, status: 'queued', acknowledgement: ack });
  } catch (err) {
    return sendError(res, err);
  }
}
