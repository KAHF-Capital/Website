// Firebase Client Configuration
import { initializeApp, getApps } from 'firebase/app';
import { 
  getAuth, 
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

// Firebase configuration - add these to your .env.local file
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Check if Firebase is configured
const isFirebaseConfigured = firebaseConfig.apiKey && firebaseConfig.projectId;

// Initialize Firebase (prevent multiple initializations)
let app = null;
let auth = null;
let db = null;
let googleProvider = null;

if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  auth = getAuth(app);
  db = getFirestore(app);
  googleProvider = new GoogleAuthProvider();
} else if (typeof window !== 'undefined') {
  console.warn('Firebase is not configured. Please add Firebase credentials to .env.local');
}

// Sign up with email and password
export async function signUp(email, password, displayName) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    
    // Update display name
    if (displayName) {
      await updateProfile(user, { displayName });
    }
    
    // Create user document in Firestore
    await setDoc(doc(db, 'users', user.uid), {
      uid: user.uid,
      email: user.email,
      displayName: displayName || null,
      createdAt: serverTimestamp(),
      subscription: {
        status: 'free',
        stripeCustomerId: null,
        stripeSubscriptionId: null
      },
      preferences: {
        minVolumeRatio: 1.5,
        watchlist: [],
        maxAlertsPerDay: 5
      },
      phoneNumber: null
    });
    
    return { success: true, user };
  } catch (error) {
    console.error('Sign up error:', error);
    return { success: false, error: getAuthErrorMessage(error.code) };
  }
}

// Sign in with email and password
export async function signIn(email, password) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { success: true, user: userCredential.user };
  } catch (error) {
    console.error('Sign in error:', error);
    return { success: false, error: getAuthErrorMessage(error.code) };
  }
}

// Sign in with Google
export async function signInWithGoogle() {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user document exists, create if not
    const userDoc = await getDoc(doc(db, 'users', user.uid));
    if (!userDoc.exists()) {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: serverTimestamp(),
        subscription: {
          status: 'free',
          stripeCustomerId: null,
          stripeSubscriptionId: null
        },
        preferences: {
          minVolumeRatio: 1.5,
          watchlist: [],
          maxAlertsPerDay: 5
        },
        phoneNumber: null
      });
    }
    
    return { success: true, user };
  } catch (error) {
    console.error('Google sign in error:', error);
    return { success: false, error: getAuthErrorMessage(error.code) };
  }
}

// Sign out
export async function logOut() {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    await signOut(auth);
    return { success: true };
  } catch (error) {
    console.error('Sign out error:', error);
    return { success: false, error: error.message };
  }
}

// Reset password
export async function resetPassword(email) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    await sendPasswordResetEmail(auth, email);
    return { success: true };
  } catch (error) {
    console.error('Password reset error:', error);
    return { success: false, error: getAuthErrorMessage(error.code) };
  }
}

// Get user data from Firestore
export async function getUserData(uid) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    const userDoc = await getDoc(doc(db, 'users', uid));
    if (userDoc.exists()) {
      return { success: true, data: userDoc.data() };
    }
    return { success: false, error: 'User not found' };
  } catch (error) {
    console.error('Get user data error:', error);
    return { success: false, error: error.message };
  }
}

// Update user subscription status
export async function updateUserSubscription(uid, subscriptionData) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    await updateDoc(doc(db, 'users', uid), {
      subscription: subscriptionData,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Update subscription error:', error);
    return { success: false, error: error.message };
  }
}

// Update user phone number
export async function updateUserPhone(uid, phoneNumber) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    await updateDoc(doc(db, 'users', uid), {
      phoneNumber: phoneNumber,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Update phone error:', error);
    return { success: false, error: error.message };
  }
}

// Update user preferences
export async function updateUserPreferences(uid, preferences) {
  if (!isFirebaseConfigured) {
    return { success: false, error: 'Firebase is not configured' };
  }
  try {
    await updateDoc(doc(db, 'users', uid), {
      preferences: preferences,
      updatedAt: serverTimestamp()
    });
    return { success: true };
  } catch (error) {
    console.error('Update preferences error:', error);
    return { success: false, error: error.message };
  }
}

// Get friendly error messages
function getAuthErrorMessage(errorCode) {
  switch (errorCode) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try signing in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign in is not enabled.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/user-disabled':
      return 'This account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
      return 'Incorrect password. Please try again.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again later.';
    case 'auth/popup-closed-by-user':
      return 'Sign in was cancelled.';
    default:
      return 'An error occurred. Please try again.';
  }
}

export { auth, db, onAuthStateChanged };

