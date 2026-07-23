// Authentication Context Provider
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, onAuthStateChanged, getUserData, logOut } from '../../lib/firebase';
import { isProStatus } from '../../lib/subscription-access';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
}

/** After login/signup, claim any Stripe subscription waiting for this email. */
async function claimPendingSubscription(firebaseUser) {
  try {
    const token = await firebaseUser.getIdToken();
    const res = await fetch('/api/claim-subscription', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({})
    });
    if (!res.ok) return false;
    const data = await res.json();
    return !!data.claimed;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Listen for auth state changes
  useEffect(() => {
    // If Firebase auth isn't configured, just set loading to false
    if (!auth) {
      setLoading(false);
      return;
    }
    
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
        
        // Fetch additional user data from Firestore
        let result = await getUserData(firebaseUser.uid);
        if (result.success) {
          setUserData(result.data);
        }
        // Pay-first users: claim a pending Stripe subscription onto this account
        // so Pro unlocks without a support ticket (only when not already Pro).
        if (!isProStatus(result?.data?.subscription?.status)) {
          const claimed = await claimPendingSubscription(firebaseUser);
          if (claimed) {
            result = await getUserData(firebaseUser.uid);
            if (result.success) setUserData(result.data);
          }
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Refresh user data
  const refreshUserData = async () => {
    if (user) {
      const result = await getUserData(user.uid);
      if (result.success) {
        setUserData(result.data);
      }
    }
  };

  // Sign out handler
  const handleSignOut = async () => {
    const result = await logOut();
    if (result.success) {
      setUser(null);
      setUserData(null);
    }
    return result;
  };

  // Pro = paid or in free trial (matches /api/kahf-ai-chat server gate)
  const hasActiveSubscription = () => {
    return isProStatus(userData?.subscription?.status);
  };

  // Get user's Stripe customer ID
  const getStripeCustomerId = () => {
    return userData?.subscription?.stripeCustomerId;
  };

  const value = {
    user,
    userData,
    loading,
    error,
    refreshUserData,
    signOut: handleSignOut,
    hasActiveSubscription,
    getStripeCustomerId,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

