// Firebase Admin SDK for server-side operations
import admin from 'firebase-admin';

function getServiceAccountCredentials() {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (serviceAccount) {
    const trimmed = serviceAccount.trim();
    const decoded = trimmed.startsWith('{')
      ? trimmed
      : Buffer.from(trimmed, 'base64').toString('utf8');
    const credentials = JSON.parse(decoded);

    if (credentials.private_key) {
      credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
    }

    return credentials;
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
      private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    };
  }

  return null;
}

// Initialize Firebase Admin (for API routes)
function getFirebaseAdmin() {
  if (admin.apps.length === 0) {
    // Check for service account credentials
    const serviceAccount = getServiceAccountCredentials();
    
    if (serviceAccount) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        });
      } catch (error) {
        console.error('Error initializing Firebase service account:', error);
        throw error;
      }
    } else {
      // Use application default credentials (for local dev or GCP environments)
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
      });
    }
  }
  
  return admin;
}

// Verify Firebase ID token
export async function verifyIdToken(idToken) {
  try {
    const adminApp = getFirebaseAdmin();
    const decodedToken = await adminApp.auth().verifyIdToken(idToken);
    return { success: true, uid: decodedToken.uid, email: decodedToken.email };
  } catch (error) {
    console.error('Token verification error:', error);
    return { success: false, error: error.message };
  }
}

// Get user by UID
export async function getUser(uid) {
  try {
    const adminApp = getFirebaseAdmin();
    const user = await adminApp.auth().getUser(uid);
    return { success: true, user };
  } catch (error) {
    console.error('Get user error:', error);
    return { success: false, error: error.message };
  }
}

// Get user by email
export async function getUserByEmail(email) {
  try {
    const adminApp = getFirebaseAdmin();
    const user = await adminApp.auth().getUserByEmail(email);
    return { success: true, user };
  } catch (error) {
    console.error('Get user by email error:', error);
    return { success: false, error: error.message };
  }
}

// Get Firestore admin instance
export function getFirestoreAdmin() {
  const adminApp = getFirebaseAdmin();
  return adminApp.firestore();
}

// Update user subscription in Firestore (server-side)
export async function updateSubscriptionAdmin(uid, subscriptionData) {
  try {
    const firestore = getFirestoreAdmin();
    await firestore.collection('users').doc(uid).update({
      subscription: subscriptionData,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Update subscription error:', error);
    return { success: false, error: error.message };
  }
}

// Get user by Stripe customer ID
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
    console.error('Get user by Stripe ID error:', error);
    return { success: false, error: error.message };
  }
}

// Get all active subscribers (for sending alerts)
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
    console.error('Get active subscribers error:', error);
    return { success: false, error: error.message, subscribers: [] };
  }
}

export default getFirebaseAdmin;


