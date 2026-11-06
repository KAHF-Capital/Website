// Message limits for KAHF AI. Counts live in Firestore so a free account
// cannot reset the quota by hitting a new server instance.

import { getFirestoreAdmin, isFirebaseAdminConfigured } from './firebase-admin';

export const ANON_LIMIT = parseInt(process.env.KAHF_AI_ANON_MESSAGE_LIMIT || '1', 10);
export const FREE_ACCOUNT_LIMIT = parseInt(process.env.KAHF_AI_FREE_ACCOUNT_LIMIT || '5', 10);

export function usagePeriod(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function usageRef(firestore, identity, period) {
  if (identity.uid) {
    return firestore.collection('users').doc(identity.uid).collection('usage').doc(period);
  }
  const id = `${period}_${identity.key}`.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 700);
  return firestore.collection('ai_usage').doc(id);
}

function snapshot(identity, period, used) {
  const limit = identity.limit;
  return {
    tier: identity.tier,
    limit,
    used,
    remaining: Math.max(limit - used, 0),
    isUnlimited: false,
    period
  };
}

async function readCount(identity, period) {
  const firestore = getFirestoreAdmin();
  const snap = await usageRef(firestore, identity, period).get();
  return snap.exists ? Number(snap.data().count || 0) : 0;
}

export async function peekUsage(identity) {
  const period = usagePeriod();
  if (identity.isUnlimited) {
    return { tier: identity.tier, limit: null, used: 0, remaining: null, isUnlimited: true, period };
  }
  if (!isFirebaseAdminConfigured()) {
    return snapshot(identity, period, 0);
  }
  const used = await readCount(identity, period);
  return snapshot(identity, period, used);
}

export async function reserveUsage(identity) {
  const period = usagePeriod();
  if (identity.isUnlimited) {
    return { tier: identity.tier, limit: null, used: 0, remaining: null, isUnlimited: true, period };
  }

  if (!isFirebaseAdminConfigured()) {
    const error = new Error('Message limits are not available until Firebase admin is configured.');
    error.statusCode = 503;
    throw error;
  }

  const firestore = getFirestoreAdmin();
  const ref = usageRef(firestore, identity, period);
  const limit = identity.limit;
  const outcome = await firestore.runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    const current = snap.exists ? Number(snap.data().count || 0) : 0;
    if (current >= limit) return { allowed: false, used: current };
    const next = current + 1;
    txn.set(ref, { count: next, updatedAt: new Date().toISOString() }, { merge: true });
    return { allowed: true, used: next };
  });

  if (!outcome.allowed) {
    const error = new Error(
      identity.tier === 'free'
        ? 'You\'ve used your free KAHF AI messages this month. Start a 7-day Pro free trial for unlimited access.'
        : 'You used your free KAHF AI message. Sign in or upgrade to Pro for more.'
    );
    error.statusCode = 429;
    error.usage = snapshot(identity, period, outcome.used);
    throw error;
  }

  return snapshot(identity, period, outcome.used);
}
