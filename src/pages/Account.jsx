import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { 
  User, Mail, Phone, Bell, Shield, CreditCard, 
  Settings, Save, AlertCircle, CheckCircle, Zap,
  ArrowLeft
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { updateUserPhone, updateUserPreferences } from '../../lib/firebase';
import Header from '../components/Header';

// Client-side phone validation
function validatePhoneNumber(phoneNumber) {
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    return { valid: true, formatted: cleaned };
  }
  if (/^\d{10}$/.test(cleaned)) {
    return { valid: true, formatted: `+1${cleaned}` };
  }
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return { valid: true, formatted: `+${cleaned}` };
  }
  
  return { valid: false, formatted: null };
}
import Footer from './Footer';

export default function Account() {
  const router = useRouter();
  const { user, userData, loading, refreshUserData, hasActiveSubscription } = useAuth();
  
  const [phoneNumber, setPhoneNumber] = useState('');
  const [preferences, setPreferences] = useState({
    minVolumeRatio: 1.5,
    maxAlertsPerDay: 5,
    watchlist: []
  });
  const [watchlistInput, setWatchlistInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/account');
    }
  }, [user, loading, router]);

  // Load user data
  useEffect(() => {
    if (userData) {
      setPhoneNumber(userData.phoneNumber || '');
      setPreferences({
        minVolumeRatio: userData.preferences?.minVolumeRatio || 1.5,
        maxAlertsPerDay: userData.preferences?.maxAlertsPerDay || 5,
        watchlist: userData.preferences?.watchlist || []
      });
      setWatchlistInput((userData.preferences?.watchlist || []).join(', '));
    }
  }, [userData]);

  const handleSavePhone = async () => {
    if (!phoneNumber) {
      setMessage({ type: 'error', text: 'Please enter a phone number' });
      return;
    }

    // Validate phone
    const validation = validatePhoneNumber(phoneNumber);
    if (!validation.valid) {
      setMessage({ type: 'error', text: 'Please enter a valid US phone number' });
      return;
    }

    setSaving(true);
    setMessage({ type: '', text: '' });

    const result = await updateUserPhone(user.uid, validation.formatted);
    
    if (result.success) {
      setMessage({ type: 'success', text: 'Phone number saved successfully!' });
      await refreshUserData();
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save phone number' });
    }

    setSaving(false);
  };

  const handleSavePreferences = async () => {
    setSaving(true);
    setMessage({ type: '', text: '' });

    // Parse watchlist
    const watchlist = watchlistInput
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(t => /^[A-Z]{1,5}$/.test(t))
      .slice(0, 20);

    const newPreferences = {
      ...preferences,
      watchlist
    };

    const result = await updateUserPreferences(user.uid, newPreferences);
    
    if (result.success) {
      setMessage({ type: 'success', text: 'Preferences saved successfully!' });
      await refreshUserData();
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save preferences' });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Back Link */}
        <Link href="/" className="inline-flex items-center text-gray-600 hover:text-green-600 mb-6">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back to Home
        </Link>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Account Settings</h1>

        {/* Message */}
        {message.text && (
          <div className={`mb-6 p-4 rounded-lg flex items-start ${
            message.type === 'success' 
              ? 'bg-green-50 border border-green-200' 
              : 'bg-red-50 border border-red-200'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0" />
            )}
            <p className={message.type === 'success' ? 'text-green-700' : 'text-red-700'}>
              {message.text}
            </p>
          </div>
        )}

        <div className="space-y-6">
          {/* Profile Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <User className="h-5 w-5 text-green-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Profile</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name
                </label>
                <input
                  type="text"
                  value={user.displayName || ''}
                  disabled
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Update your display name through your Google account or Firebase settings
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="flex items-center">
                  <Mail className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-gray-900">{user.email}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Subscription Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <CreditCard className="h-5 w-5 text-green-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Subscription</h2>
            </div>
            
            {hasActiveSubscription() ? (
              <div className="space-y-4">
                <div className="flex items-center p-4 bg-green-50 rounded-lg">
                  <Zap className="h-6 w-6 text-green-600 mr-3" />
                  <div>
                    <p className="font-semibold text-green-800">VolAlert Pro Active</p>
                    <p className="text-sm text-green-600">You have full access to SMS alerts</p>
                  </div>
                </div>
                
                <a
                  href="https://billing.stripe.com/p/login/cNi28tdb74N6d8L6lz0oM00"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Manage Billing
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-gray-600">
                  You're on the free plan. Upgrade to VolAlert Pro for SMS alerts on dark pool activity.
                </p>
                <a
                  href="https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <Zap className="h-5 w-5 mr-2" />
                  Upgrade to VolAlert Pro
                </a>
              </div>
            )}
          </div>

          {/* Phone Number Section (for SMS alerts) */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Phone className="h-5 w-5 text-green-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">SMS Alerts Phone</h2>
            </div>
            
            <p className="text-gray-600 text-sm mb-4">
              {hasActiveSubscription() 
                ? 'Enter your phone number to receive SMS alerts for dark pool activity.'
                : 'Upgrade to VolAlert Pro to receive SMS alerts.'}
            </p>
            
            <div className="flex space-x-3">
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+1 (555) 123-4567"
                disabled={!hasActiveSubscription()}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
              <button
                onClick={handleSavePhone}
                disabled={saving || !hasActiveSubscription()}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <Save className="h-4 w-4 mr-1" />
                Save
              </button>
            </div>
          </div>

          {/* Alert Preferences Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center mb-4">
              <Bell className="h-5 w-5 text-green-600 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Alert Preferences</h2>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Volume Ratio
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Only alert when dark pool volume is X times higher than the 7-day average
                </p>
                <select
                  value={preferences.minVolumeRatio}
                  onChange={(e) => setPreferences(p => ({ ...p, minVolumeRatio: parseFloat(e.target.value) }))}
                  disabled={!hasActiveSubscription()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                >
                  <option value={1.0}>1.0x (All activity)</option>
                  <option value={1.5}>1.5x (Moderate spike)</option>
                  <option value={2.0}>2.0x (High activity)</option>
                  <option value={3.0}>3.0x (Very high activity)</option>
                  <option value={5.0}>5.0x (Extreme activity only)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Alerts Per Day
                </label>
                <select
                  value={preferences.maxAlertsPerDay}
                  onChange={(e) => setPreferences(p => ({ ...p, maxAlertsPerDay: parseInt(e.target.value) }))}
                  disabled={!hasActiveSubscription()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                >
                  <option value={3}>3 alerts</option>
                  <option value={5}>5 alerts</option>
                  <option value={10}>10 alerts</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Watchlist (optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Comma-separated tickers to prioritize (e.g., AAPL, TSLA, SPY)
                </p>
                <input
                  type="text"
                  value={watchlistInput}
                  onChange={(e) => setWatchlistInput(e.target.value)}
                  placeholder="AAPL, TSLA, SPY, NVDA"
                  disabled={!hasActiveSubscription()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                />
              </div>
              
              <button
                onClick={handleSavePreferences}
                disabled={saving || !hasActiveSubscription()}
                className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
              >
                <Save className="h-4 w-4 mr-2" />
                {saving ? 'Saving...' : 'Save Preferences'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}

