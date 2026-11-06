// GET  /api/kimi/profile   -> profile, preferences, UI config
// POST /api/kimi/profile   -> { action: 'update_preferences', preferences } |
//                             { action: 'opt_out' } | { action: 'opt_in' }

import { allowMethods, requireUser, sendError } from '../../../lib/kimi/auth.js';
import { loadProfileForUser, profileView, publicConfig, setOptOut } from '../../../lib/kimi/onboarding.js';
import { applyPreferenceChanges } from '../../../lib/kimi/tools.js';

const PREFERENCE_FIELDS = [
  'watchlist_mode',
  'set_tickers',
  'set_sectors',
  'mute_tickers',
  'unmute_tickers',
  'min_notional',
  'timezone',
  'quiet_hours',
  'market_hours_only',
  'max_alerts_per_day',
  'digest',
  'paused_until'
];

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return;
  try {
    const user = await requireUser(req);
    const profile = await loadProfileForUser(user);
    if (req.method === 'GET') {
      return res.status(200).json({ profile: profileView(profile), config: publicConfig() });
    }
    const { action } = req.body || {};
    if (action === 'update_preferences') {
      const input = req.body.preferences || {};
      const args = Object.fromEntries(PREFERENCE_FIELDS.filter((k) => input[k] !== undefined).map((k) => [k, input[k]]));
      await applyPreferenceChanges(user.uid, args, { source: 'website' }).catch((err) => {
        throw Object.assign(err, { status: err.code === 'NOT_FOUND' ? 404 : 400 });
      });
      return res.status(200).json({ profile: profileView(await loadProfileForUser(user)) });
    }
    if (action === 'opt_out' || action === 'opt_in') {
      return res.status(200).json({ profile: await setOptOut({ user, optedOut: action === 'opt_out' }) });
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return sendError(res, err);
  }
}
