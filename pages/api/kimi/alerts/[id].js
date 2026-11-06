// GET /api/kimi/alerts/:id -> one alert, only for a user it was sent to.

import { allowMethods, HttpError, requireUser, sendError } from '../../../../lib/kimi/auth.js';
import { KIMI_CONFIG } from '../../../../lib/kimi/kimi.config.js';
import { getAlert, getDelivery } from '../../../../lib/kimi/store.js';
import { alertSummary } from '../../../../lib/kimi/views.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return;
  try {
    const user = await requireUser(req);
    const id = String(req.query.id || '');
    const delivery = await getDelivery(id, user.uid);
    if (!delivery || !['sent', 'delivered'].includes(delivery.status)) throw new HttpError(404, 'Alert not found');
    const alert = await getAlert(id);
    if (!alert) throw new HttpError(404, 'Alert not found');
    return res.status(200).json({
      alert: {
        ...alertSummary(alert, delivery),
        backend_param_version: alert.backend_param_version || null,
        signal_payload: alert.signal_payload,
        retracted_at: alert.retracted_at || null
      },
      disclaimer: KIMI_CONFIG.disclaimers.alertPage
    });
  } catch (err) {
    return sendError(res, err);
  }
}
