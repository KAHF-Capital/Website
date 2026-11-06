// POST /api/kimi/onboarding
//   { action: 'send_code', phone }
//   { action: 'verify', code, consent: true, consent_version }

import { allowMethods, clientIp, requireUser, sendError } from '../../../lib/kimi/auth.js';
import { confirmPhoneVerification, startPhoneVerification } from '../../../lib/kimi/onboarding.js';

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return;
  try {
    const user = await requireUser(req);
    const { action } = req.body || {};
    if (action === 'send_code') {
      return res.status(200).json(await startPhoneVerification({ user, phone: req.body.phone }));
    }
    if (action === 'verify') {
      return res.status(200).json(
        await confirmPhoneVerification({
          user,
          code: req.body.code,
          consent: req.body.consent === true,
          consentVersion: req.body.consent_version,
          ip: clientIp(req),
          userAgent: req.headers['user-agent'] || null
        })
      );
    }
    return res.status(400).json({ error: 'Unknown action' });
  } catch (err) {
    return sendError(res, err);
  }
}
