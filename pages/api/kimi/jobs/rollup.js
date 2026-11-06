// GET|POST /api/kimi/jobs/rollup?from=YYYY-MM-DD&to=YYYY-MM-DD  (cron)
// Rebuilds kimi_daily_rollups (default: the last three days, ET).

import { allowMethods, requireCron, sendError } from '../../../../lib/kimi/auth.js';
import { runRollups } from '../../../../lib/kimi/jobs.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    requireCron(req);
    return res.status(200).json(await runRollups({ from: req.query.from || null, to: req.query.to || null }));
  } catch (err) {
    return sendError(res, err);
  }
}
