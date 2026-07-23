// Claim a Stripe subscription onto the logged-in Firebase user.
//
// POST body:
//   { sessionId?: string }  — from Stripe Checkout redirect (?session_id=)
//   empty body              — claim any pending_subscriptions row for this email
//
// Auth: Firebase ID token (Bearer). Makes pay-first → sign-up seamless.

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
  const { sessionId } = req.body || {};

  try {
    // Path A: just claimed a pending payment (no session id) — e.g. after signup
    if (!sessionId) {
      const claimed = await firebaseAdmin.claimPendingSubscriptionForEmail(uid, userEmail);
      return res.status(200).json({
        ok: true,
        claimed: !!claimed.claimed,
        status: claimed.status || null,
        source: 'pending'
      });
    }

    // Path B: returning from Stripe with a checkout session id
    const customerInfo = await getCheckoutSessionCustomer(sessionId);
    if (!customerInfo?.customerId) {
      return res.status(400).json({ error: 'Could not load checkout session' });
    }

    const sessionEmail = normalizeEmail(customerInfo.customerEmail);
    // Soft check: warn but still allow if emails differ (user may have paid with another inbox)
    const emailMismatch = sessionEmail && userEmail && sessionEmail !== userEmail;

    const status = statusFromStripe(customerInfo.subscriptionStatus) || 'active';
    await firebaseAdmin.applySubscriptionToUser(uid, {
      status,
      stripeCustomerId: customerInfo.customerId,
      stripeSubscriptionId: customerInfo.subscriptionId,
      phoneNumber: customerInfo.customerPhone || undefined,
      email: userEmail || sessionEmail
    });

    // Clear pending for both emails if present
    if (sessionEmail) {
      await firebaseAdmin.claimPendingSubscriptionForEmail(uid, sessionEmail);
    }
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
  } catch (err) {
    console.error('[claim-subscription]', err);
    return res.status(500).json({ error: err.message || 'Could not link subscription' });
  }
}
