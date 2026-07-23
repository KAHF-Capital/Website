// POST /api/admin/grant-pro
// Manually link a live Stripe subscription to a Firebase user by email.
// Authorization: Bearer ADMIN_SECRET
//
// Body: { "email": "user@example.com" }
//
// Use when a payment succeeded but Firestore still shows free
// (webhook miss / email mismatch recovery).

import { findActiveSubscriptionByEmail } from '../../../lib/stripe-service';
import { normalizeEmail, statusFromStripe } from '../../../lib/subscription-access';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../../lib/firebase-admin');
} catch (e) {}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.authorization || '';
  if (!adminSecret || authHeader !== `Bearer ${adminSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!firebaseAdmin?.isFirebaseAdminConfigured?.()) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const email = normalizeEmail(req.body?.email);
  if (!email) {
    return res.status(400).json({ error: 'email required' });
  }

  try {
    const live = await findActiveSubscriptionByEmail(email);
    if (!live) {
      // Still park as pending so next login with this email claims it —
      // but only if we at least know they paid (check any customer)
      return res.status(404).json({
        error: `No active/trialing Stripe subscription for ${email}`,
        hint: 'Confirm the email on the Stripe customer matches the Firebase account email.'
      });
    }

    const found = await firebaseAdmin.findUserForCheckout({
      email,
      stripeCustomerId: live.customerId
    });

    if (found.success) {
      await firebaseAdmin.applySubscriptionToUser(found.uid, {
        status: live.subscriptionStatus,
        stripeCustomerId: live.customerId,
        stripeSubscriptionId: live.subscriptionId,
        phoneNumber: live.customerPhone || undefined,
        email
      });
      return res.status(200).json({
        ok: true,
        granted: true,
        uid: found.uid,
        status: statusFromStripe(live.subscriptionStatus),
        matchedBy: found.matchedBy,
        subscriptionId: live.subscriptionId
      });
    }

    // No Firebase account yet — save pending for claim on signup
    await firebaseAdmin.savePendingSubscription({
      email,
      status: live.subscriptionStatus,
      stripeCustomerId: live.customerId,
      stripeSubscriptionId: live.subscriptionId,
      phoneNumber: live.customerPhone
    });

    return res.status(200).json({
      ok: true,
      granted: false,
      pending: true,
      email,
      status: statusFromStripe(live.subscriptionStatus),
      message: 'No Firebase user for this email yet — pending claim saved. Have them sign in with this exact email.'
    });
  } catch (err) {
    console.error('[grant-pro]', err);
    return res.status(500).json({ error: err.message });
  }
}
