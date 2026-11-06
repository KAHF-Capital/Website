// GET|POST /api/kimi/jobs/tick  (cron: Authorization: Bearer <CRON_SECRET>)
// Drains inbound jobs, polls backend signals, sends due digests, sweeps stuck
// backtests, records forward returns and checks global spend.

import { allowMethods, requireCron, sendError } from '../../../../lib/kimi/auth.js';
import { runTick } from '../../../../lib/kimi/jobs.js';

export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    requireCron(req);
    return res.status(200).json(await runTick());
  } catch (err) {
    return sendError(res, err);
  }
}
