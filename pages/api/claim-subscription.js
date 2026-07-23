// POST /api/claim-subscription
//
// Body:
//   { sessionId?: string }  — from Stripe redirect (?session_id=)
//   empty                   — claim pending + heal from live Stripe by email
//
// Auth: Firebase ID token (Bearer).

import { getCheckoutSessionCustomer } from '../../lib/stripe-service';
import { normalizeEmail, statusFromStripe } from '../../lib/subscription-access';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!firebaseAdmin || !firebaseAdmin.isFirebaseAdminConfigured?.()) {
    return res.status(503).json({ error: 'Subscription linking temporarily unavailable' });
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Sign in required', needsAuth: true });
  }

  const verified = await firebaseAdmin.verifyIdToken(token);
  if (!verified.success) {
    return res.status(401).json({ error: 'Invalid session', needsAuth: true });
  }

  const uid = verified.uid;
  const userEmail = normalizeEmail(verified.email);
  const { sessionId, deep = false } = req.body || {};

  try {
    // Path B: returning from Stripe with a checkout session id
    if (sessionId) {
      const customerInfo = await getCheckoutSessionCustomer(sessionId);
      if (!customerInfo?.customerId) {
        return res.status(400).json({ error: 'Could not load checkout session' });
      }

      const sessionEmail = normalizeEmail(customerInfo.customerEmail);
      const emailMismatch = sessionEmail && userEmail && sessionEmail !== userEmail;
      const status = statusFromStripe(customerInfo.subscriptionStatus) || 'active';

      await firebaseAdmin.applySubscriptionToUser(uid, {
        status,
        stripeCustomerId: customerInfo.customerId,
        stripeSubscriptionId: customerInfo.subscriptionId,
        phoneNumber: customerInfo.customerPhone || undefined,
        email: userEmail || sessionEmail
      });

      if (sessionEmail) await firebaseAdmin.claimPendingSubscriptionForEmail(uid, sessionEmail);
      if (userEmail && userEmail !== sessionEmail) {
        await firebaseAdmin.claimPendingSubscriptionForEmail(uid, userEmail);
      }

      return res.status(200).json({
        ok: true,
        claimed: true,
        status,
        source: 'session',
        emailMismatch: !!emailMismatch,
        sessionEmail: sessionEmail || null
      });
    }

    // Path A: no session id. Claim a parked pending doc (cheap); only touch
    // live Stripe when the caller explicitly asks (deep) — e.g. the success page.
    const healed = await firebaseAdmin.ensureProAccess(uid, userEmail, { deep: !!deep });
    return res.status(200).json({
      ok: true,
      claimed: !!healed.healed,
      status: healed.status || null,
      isPro: !!healed.isPro,
      source: healed.healed ? 'stripe_or_pending' : 'none'
    });
  } catch (err) {
    console.error('[claim-subscription]', err);
    return res.status(500).json({ error: err.message || 'Could not link subscription' });
  }
}
