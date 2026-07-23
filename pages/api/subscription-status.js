// GET /api/subscription-status
// Returns the caller's Pro status and auto-heals from Stripe/pending if needed.
// Called by KAHF AI (and Account) on load so the UI doesn't stay stuck on Free
// after a successful payment.

import { isProStatus } from '../../lib/subscription-access';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!firebaseAdmin || !firebaseAdmin.isFirebaseAdminConfigured?.()) {
    return res.status(503).json({ error: 'Subscription status unavailable' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Sign in required', isPro: false });
  }

  const verified = await firebaseAdmin.verifyIdToken(token);
  if (!verified.success) {
    return res.status(401).json({ error: 'Invalid session', isPro: false });
  }

  try {
    // deep=1 does a live Stripe lookup — only on explicit "I already paid" recovery.
    const deep = req.query.deep === '1' || req.query.deep === 'true';
    const result = await firebaseAdmin.ensureProAccess(verified.uid, verified.email, { deep });
    const status = result.status || 'free';
    const isPro = result.isPro || isProStatus(status);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      ok: true,
      isPro,
      status,
      healed: !!result.healed,
      usage: isPro
        ? { tier: 'pro', limit: null, remaining: null, isUnlimited: true }
        : { tier: 'free', limit: 5, remaining: null, isUnlimited: false }
    });
  } catch (err) {
    console.error('[subscription-status]', err);
    return res.status(500).json({ error: err.message || 'Status check failed', isPro: false });
  }
}
