// Shared subscription access helpers.
// Used by AuthContext (UI), kahf-ai-chat (API), stripe-webhook, and digest cron
// so "Pro" means the same thing everywhere.

export const PRO_STATUSES = new Set(['active', 'trialing']);

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isProStatus(status) {
  return PRO_STATUSES.has(String(status || '').toLowerCase());
}

/** Map Stripe subscription.status into what we store on the user doc. */
export function statusFromStripe(stripeStatus) {
  const s = String(stripeStatus || '').toLowerCase();
  if (s === 'trialing') return 'trialing';
  if (s === 'active') return 'active';
  if (s === 'past_due') return 'past_due';
  if (s === 'unpaid') return 'unpaid';
  if (s === 'canceled' || s === 'cancelled') return 'cancelled';
  return s || 'free';
}

// CJS interop for require()-based API routes
export default {
  PRO_STATUSES,
  normalizeEmail,
  isProStatus,
  statusFromStripe
};
