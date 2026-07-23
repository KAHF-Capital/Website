import admin from 'firebase-admin';
import { isProStatus, normalizeEmail, statusFromStripe } from './subscription-access.js';

let cachedInitError = null;

function parseServiceAccountFromEnv() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf8');
      return JSON.parse(decoded);
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_BASE64 is set but could not be decoded/parsed: ${error.message}`);
    }
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      return parsed;
    } catch (error) {
      throw new Error(`FIREBASE_SERVICE_ACCOUNT_KEY is set but could not be parsed as JSON: ${error.message}`);
    }
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n')
    };
  }

  return null;
}

export function isFirebaseAdminConfigured() {
  if (admin.apps.length > 0) return true;
  try {
    return parseServiceAccountFromEnv() !== null;
  } catch (error) {
    cachedInitError = error.message;
    return false;
  }
}

function getFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin;
  }

  const serviceAccount = parseServiceAccountFromEnv();
  const projectId =
    process.env.FIREBASE_ADMIN_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    serviceAccount?.project_id;

  if (serviceAccount) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: serviceAccount.project_id || projectId,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key
      }),
      projectId: serviceAccount.project_id || projectId
    });
    cachedInitError = null;
    return admin;
  }

  try {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId
    });
    cachedInitError = null;
    return admin;
  } catch (error) {
    cachedInitError = `Firebase Admin not configured. Set FIREBASE_SERVICE_ACCOUNT_BASE64 (recommended), FIREBASE_SERVICE_ACCOUNT_KEY, or the FIREBASE_ADMIN_* trio in your environment. Details: ${error.message}`;
    throw new Error(cachedInitError);
  }
}

export async function verifyIdToken(idToken) {
  try {
    const adminApp = getFirebaseAdmin();
    const decodedToken = await adminApp.auth().verifyIdToken(idToken);
    return { success: true, uid: decodedToken.uid, email: decodedToken.email };
  } catch (error) {
    console.error('Token verification error:', error.message);
    return { success: false, error: cachedInitError || error.message };
  }
}

export async function getUser(uid) {
  try {
    const adminApp = getFirebaseAdmin();
    const user = await adminApp.auth().getUser(uid);
    return { success: true, user };
  } catch (error) {
    console.error('Get user error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function getUserByEmail(email) {
  try {
    const adminApp = getFirebaseAdmin();
    const user = await adminApp.auth().getUserByEmail(email);
    return { success: true, user };
  } catch (error) {
    console.error('Get user by email error:', error.message);
    return { success: false, error: error.message };
  }
}

export function getFirestoreAdmin() {
  const adminApp = getFirebaseAdmin();
  return adminApp.firestore();
}

const PENDING_COLLECTION = 'pending_subscriptions';

export async function updateSubscriptionAdmin(uid, subscriptionData) {
  try {
    const firestore = getFirestoreAdmin();
    await firestore.collection('users').doc(uid).update({
      subscription: subscriptionData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Update subscription error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Apply a Stripe subscription onto a Firebase user doc (merge phone if provided).
 * This is the durable source of truth for Pro UI + digests.
 */
export async function applySubscriptionToUser(uid, {
  status,
  stripeCustomerId,
  stripeSubscriptionId,
  phoneNumber = undefined,
  email = undefined
} = {}) {
  try {
    const firestore = getFirestoreAdmin();
    const ref = firestore.collection('users').doc(uid);
    const snap = await ref.get();
    const patch = {
      subscription: {
        status: statusFromStripe(status) || status || 'active',
        stripeCustomerId: stripeCustomerId || null,
        stripeSubscriptionId: stripeSubscriptionId || null,
        updatedAt: new Date().toISOString()
      },
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    if (phoneNumber) patch.phoneNumber = phoneNumber;
    // Keep email in sync when Stripe has a confirmed address and the doc is missing one
    if (email && snap.exists && !snap.data()?.email) {
      patch.email = normalizeEmail(email);
    }
    if (snap.exists) {
      await ref.update(patch);
    } else {
      await ref.set({
        uid,
        email: email ? normalizeEmail(email) : null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        preferences: { minVolumeRatio: 3, watchlist: [], maxAlertsPerDay: 25 },
        phoneNumber: phoneNumber || null,
        ...patch
      }, { merge: true });
    }
    return { success: true, uid };
  } catch (error) {
    console.error('Apply subscription error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function getUserByStripeCustomerId(stripeCustomerId) {
  try {
    const firestore = getFirestoreAdmin();
    const snapshot = await firestore
      .collection('users')
      .where('subscription.stripeCustomerId', '==', stripeCustomerId)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return { success: false, error: 'User not found' };
    }

    const doc = snapshot.docs[0];
    return { success: true, uid: doc.id, data: doc.data() };
  } catch (error) {
    console.error('Get user by Stripe ID error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Resolve a Firebase user for a checkout/webhook event.
 * Priority: explicit uid (client_reference_id) → Stripe customer id → Auth email → Firestore email.
 */
export async function findUserForCheckout({ uid, email, stripeCustomerId } = {}) {
  // 1) Explicit Firebase UID from checkout (logged-in purchase)
  if (uid) {
    try {
      const firestore = getFirestoreAdmin();
      const snap = await firestore.collection('users').doc(uid).get();
      if (snap.exists) return { success: true, uid, data: snap.data(), matchedBy: 'uid' };
      // Auth user may exist without a Firestore doc yet
      const authUser = await getUser(uid);
      if (authUser.success) return { success: true, uid, data: null, matchedBy: 'uid_auth' };
    } catch (e) {
      console.error('findUserForCheckout uid lookup:', e.message);
    }
  }

  // 2) Already linked Stripe customer
  if (stripeCustomerId) {
    const byCustomer = await getUserByStripeCustomerId(stripeCustomerId);
    if (byCustomer.success) return { ...byCustomer, matchedBy: 'stripeCustomerId' };
  }

  // 3) Firebase Auth email (case-insensitive via Auth API)
  const normalized = normalizeEmail(email);
  if (normalized) {
    const byAuth = await getUserByEmail(normalized);
    if (byAuth.success) {
      return { success: true, uid: byAuth.user.uid, data: null, matchedBy: 'auth_email' };
    }
    // 4) Firestore email field (exact match — also try as stored)
    try {
      const firestore = getFirestoreAdmin();
      const snapshot = await firestore
        .collection('users')
        .where('email', '==', normalized)
        .limit(1)
        .get();
      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        return { success: true, uid: doc.id, data: doc.data(), matchedBy: 'firestore_email' };
      }
    } catch (e) {
      console.error('findUserForCheckout firestore email:', e.message);
    }
  }

  return { success: false, error: 'User not found' };
}

/** Persist a paid subscription until the buyer creates/logs into an account. */
export async function savePendingSubscription({
  email,
  status,
  stripeCustomerId,
  stripeSubscriptionId,
  phoneNumber = null
}) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { success: false, error: 'email required' };
  try {
    const firestore = getFirestoreAdmin();
    await firestore.collection(PENDING_COLLECTION).doc(normalized).set({
      email: normalized,
      status: statusFromStripe(status) || 'active',
      stripeCustomerId: stripeCustomerId || null,
      stripeSubscriptionId: stripeSubscriptionId || null,
      phoneNumber: phoneNumber || null,
      updatedAt: new Date().toISOString(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    return { success: true, email: normalized };
  } catch (error) {
    console.error('savePendingSubscription error:', error.message);
    return { success: false, error: error.message };
  }
}

/** Apply + clear a pending subscription for this email (called on login/signup). */
export async function claimPendingSubscriptionForEmail(uid, email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !uid) return { success: false, claimed: false };
  try {
    const firestore = getFirestoreAdmin();
    const ref = firestore.collection(PENDING_COLLECTION).doc(normalized);
    const snap = await ref.get();
    if (!snap.exists) return { success: true, claimed: false };
    const pending = snap.data();
    if (!isProStatus(pending.status) && pending.status !== 'past_due') {
      // Stale cancelled pending — just delete
      await ref.delete();
      return { success: true, claimed: false };
    }
    await applySubscriptionToUser(uid, {
      status: pending.status,
      stripeCustomerId: pending.stripeCustomerId,
      stripeSubscriptionId: pending.stripeSubscriptionId,
      phoneNumber: pending.phoneNumber || undefined,
      email: normalized
    });
    await ref.delete();
    console.log(`Claimed pending subscription for ${normalized} → uid ${uid}`);
    return { success: true, claimed: true, status: pending.status };
  } catch (error) {
    console.error('claimPendingSubscriptionForEmail error:', error.message);
    return { success: false, claimed: false, error: error.message };
  }
}

/**
 * Digest recipients for the 11am cron.
 * Includes email-only Pro users (not just phone) and trialing.
 */
export async function getActiveSubscribersAdmin() {
  try {
    const firestore = getFirestoreAdmin();
    const snapshot = await firestore
      .collection('users')
      .where('subscription.status', 'in', ['active', 'trialing'])
      .get();

    const subscribers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      const email = normalizeEmail(data.email);
      const phoneNumber = data.phoneNumber || null;
      if (!email && !phoneNumber) return;
      subscribers.push({
        id: doc.id,
        uid: doc.id,
        email: email || null,
        phoneNumber,
        preferences: data.preferences || {},
        stripeCustomerId: data.subscription?.stripeCustomerId || null,
        status: data.subscription?.status || 'active'
      });
    });

    return { success: true, subscribers };
  } catch (error) {
    console.error('Get active subscribers error:', error.message);
    return { success: false, error: error.message, subscribers: [] };
  }
}

/** @deprecated alias — prefer getActiveSubscribersAdmin */
export async function getDigestRecipientsAdmin() {
  return getActiveSubscribersAdmin();
}

/**
 * If the user isn't Pro yet, try to recover access.
 *
 * Two tiers, so we never make an external Stripe call on the hot path:
 *   - Always (cheap, Firestore-only): claim a pending_subscriptions doc the
 *     webhook parked for this email (covers pay-then-signup with same email).
 *   - deep=true only (one live Stripe lookup): recover a webhook miss by
 *     finding an active/trialing Stripe sub for this email. Reserve this for
 *     explicit user action ("I already paid") and the post-checkout page.
 *
 * Returns { isPro, status, healed, userData }.
 */
export async function ensureProAccess(uid, email, { deep = false } = {}) {
  const firestore = getFirestoreAdmin();
  let snap = await firestore.collection('users').doc(uid).get();
  let userData = snap.exists ? snap.data() : null;
  let status = userData?.subscription?.status || 'free';
  if (isProStatus(status)) {
    return { isPro: true, status, healed: false, userData };
  }

  let healed = false;

  // Cheap: pending doc parked by the webhook (Firestore read only)
  const pending = await claimPendingSubscriptionForEmail(uid, email);
  if (pending.claimed) {
    healed = true;
    status = pending.status || 'active';
  }

  // Expensive: live Stripe lookup — only on explicit recovery
  if (!isProStatus(status) && deep) {
    try {
      const { findActiveSubscriptionByEmail } = require('./stripe-service');
      const live = await findActiveSubscriptionByEmail(email);
      if (live) {
        await applySubscriptionToUser(uid, {
          status: live.subscriptionStatus,
          stripeCustomerId: live.customerId,
          stripeSubscriptionId: live.subscriptionId,
          phoneNumber: live.customerPhone || undefined,
          email
        });
        healed = true;
        status = statusFromStripe(live.subscriptionStatus) || 'active';
        console.log(`ensureProAccess: linked Stripe ${live.subscriptionId} (${status}) to uid=${uid}`);
      }
    } catch (err) {
      console.error('ensureProAccess Stripe lookup failed:', err.message);
    }
  }

  if (healed) {
    snap = await firestore.collection('users').doc(uid).get();
    userData = snap.exists ? snap.data() : userData;
    status = userData?.subscription?.status || status;
  }

  return { isPro: isProStatus(status), status, healed, userData };
}

// -----------------------------------------------------------------------------
// Track record (manual wins) helpers
// -----------------------------------------------------------------------------
// Each doc in `track_record` represents one closed/published trade alert.
// Shape: { date, ticker, volume_ratio, total_value, avg_price, result,
//          estimated_return_pct, note, createdAt, updatedAt }

const TRACK_RECORD_COLLECTION = 'track_record';

export async function listTrackRecordEntries({ limit = 200 } = {}) {
  try {
    const firestore = getFirestoreAdmin();
    const snapshot = await firestore
      .collection(TRACK_RECORD_COLLECTION)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
    const entries = [];
    snapshot.forEach((doc) => entries.push({ id: doc.id, ...doc.data() }));
    return { success: true, entries };
  } catch (error) {
    console.error('List track record error:', error.message);
    return { success: false, error: error.message, entries: [] };
  }
}

export async function createTrackRecordEntry(data) {
  try {
    const firestore = getFirestoreAdmin();
    const payload = {
      ...data,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };
    const ref = await firestore.collection(TRACK_RECORD_COLLECTION).add(payload);
    return { success: true, id: ref.id };
  } catch (error) {
    console.error('Create track record error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function updateTrackRecordEntry(id, data) {
  try {
    const firestore = getFirestoreAdmin();
    await firestore
      .collection(TRACK_RECORD_COLLECTION)
      .doc(id)
      .update({
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    return { success: true };
  } catch (error) {
    console.error('Update track record error:', error.message);
    return { success: false, error: error.message };
  }
}

export async function deleteTrackRecordEntry(id) {
  try {
    const firestore = getFirestoreAdmin();
    await firestore.collection(TRACK_RECORD_COLLECTION).doc(id).delete();
    return { success: true };
  } catch (error) {
    console.error('Delete track record error:', error.message);
    return { success: false, error: error.message };
  }
}

export default getFirebaseAdmin;
