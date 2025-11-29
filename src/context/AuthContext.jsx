// Authentication Context Provider
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, onAuthStateChanged, getUserData, logOut } from '../../lib/firebase';

const AuthContext = createContext({});

export function useAuth() {
  return useContext(AuthContext);
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
        const result = await getUserData(firebaseUser.uid);
        if (result.success) {
          setUserData(result.data);
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

  // Check if user has active subscription
  const hasActiveSubscription = () => {
    return userData?.subscription?.status === 'active';
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

