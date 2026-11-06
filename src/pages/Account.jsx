import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import {
  User, Mail, CreditCard, Zap,
  ArrowLeft, Gift, Copy, Check
} from 'lucide-react';
import { siteConfig } from '../../lib/site-config';
import { track } from '../../lib/analytics';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from './Footer';

export default function Account() {
  const router = useRouter();
  const { user, userData, loading, hasActiveSubscription } = useAuth();
  const [refCopied, setRefCopied] = useState(false);

  const refCode = user?.uid ? `kahf_${user.uid.slice(0, 8)}` : '';
  const refLink = refCode ? `${siteConfig.url}/?ref=${refCode}` : '';

  const copyRefLink = async () => {
    if (!refLink) return;
    try {
      await navigator.clipboard.writeText(refLink);
      setRefCopied(true);
      track('referral_link_copied', { refCode });
      setTimeout(() => setRefCopied(false), 1800);
    } catch {}
  };

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/account');
    }
  }, [user, loading, router]);

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
                    <p className="font-semibold text-green-800">
                      {userData?.subscription?.status === 'trialing' ? 'Pro Trial' : 'Pro Active'}
                    </p>
                    <p className="text-sm text-green-700">
                      {userData?.subscription?.status === 'trialing'
                        ? 'Your free trial includes unlimited chat with KAHF.'
                        : 'Unlimited KAHF chat · Full history'}
                    </p>
                  </div>
                </div>

                <a
                  href={siteConfig.manageBillingUrl}
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
                  You're on the free plan. Upgrade to Pro for unlimited chat with KAHF and full scanner history.
                </p>
                <Link
                  href="/pricing"
                  className="inline-flex items-center bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
                >
                  <Zap className="h-5 w-5 mr-2" />
                  Start 7-day free trial
                </Link>
              </div>
            )}
          </div>

          {/* Referral Section */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg border border-amber-200 p-6">
            <div className="flex items-center mb-3">
              <Gift className="h-5 w-5 text-amber-700 mr-2" />
              <h2 className="text-xl font-semibold text-gray-900">Refer & earn</h2>
            </div>
            <p className="text-gray-700 text-sm mb-4">
              Share your link. Every paid signup gives <strong>you 1 free month</strong> and gives <strong>them 1 free month</strong>. Stack up to 12 months on us.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                readOnly
                value={refLink}
                className="flex-1 px-3 py-2 border border-amber-200 bg-white rounded-lg text-sm text-gray-700 font-mono"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyRefLink}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
              >
                {refCopied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
              </button>
            </div>
            <div className="flex gap-2 mt-3 text-sm">
              <a
                href={`https://twitter.com/intent/tweet?text=${encodeURIComponent('KAHF is how I read dark pool flow and historical options hit rates.')}&url=${encodeURIComponent(refLink)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('referral_share_clicked', { channel: 'twitter' })}
                className="text-amber-800 hover:underline font-semibold"
              >
                Share on X →
              </a>
            </div>
          </div>
        </div>
      </div>
      
      <Footer />
    </div>
  );
}

