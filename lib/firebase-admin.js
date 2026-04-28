import admin from 'firebase-admin';

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

export async function getActiveSubscribersAdmin() {
  try {
    const firestore = getFirestoreAdmin();
    const snapshot = await firestore
      .collection('users')
      .where('subscription.status', '==', 'active')
      .get();

    const subscribers = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.phoneNumber) {
        subscribers.push({
          uid: doc.id,
          email: data.email,
          phoneNumber: data.phoneNumber,
          preferences: data.preferences || {},
          stripeCustomerId: data.subscription?.stripeCustomerId
        });
      }
    });

    return { success: true, subscribers };
  } catch (error) {
    console.error('Get active subscribers error:', error.message);
    return { success: false, error: error.message, subscribers: [] };
  }
}

export default getFirebaseAdmin;
