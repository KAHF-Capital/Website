import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { CheckCircle, Loader2, LogIn, Sparkles, ArrowRight } from 'lucide-react';
import Header from '../components/Header';
import Footer from './Footer';
import { useAuth } from '../context/AuthContext';
import { siteConfig } from '../../lib/site-config';
import { track } from '../../lib/analytics';

/**
 * Stripe Payment Link success redirect target.
 * Configure in Stripe Dashboard → Payment Link → After payment → Redirect to:
 *   https://www.kahfcapital.com/subscribe/success?session_id={CHECKOUT_SESSION_ID}
 */
export default function SubscribeSuccess() {
  const router = useRouter();
  const { user, loading, refreshUserData } = useAuth();
  const [status, setStatus] = useState('loading'); // loading | success | needs_auth | error
  const [message, setMessage] = useState('');
  const sessionId = typeof router.query.session_id === 'string' ? router.query.session_id : null;

  useEffect(() => {
    if (!router.isReady || loading) return;

    let cancelled = false;

    async function run() {
      track('subscribe_success_viewed', { hasSession: !!sessionId, signedIn: !!user });

      if (!user) {
        setStatus('needs_auth');
        setMessage('Sign in with the email you used at checkout to unlock Pro.');
        return;
      }

      try {
        const token = await user.getIdToken();
        const res = await fetch('/api/claim-subscription', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          // With a session id we link that exact checkout; without one (rare,
          // misconfigured redirect) fall back to a live Stripe lookup by email.
          body: JSON.stringify(sessionId ? { sessionId } : { deep: true })
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (!res.ok) {
          setStatus('error');
          setMessage(data.error || 'Something went wrong linking your subscription.');
          return;
        }

        await refreshUserData();
        setStatus('success');
        setMessage(
          data.emailMismatch
            ? `Pro is unlocked on this account. Checkout email was ${data.sessionEmail} — digests go to your account email.`
            : 'You\'re all set. Pro is unlocked — including unlimited KAHF AI and the daily digest.'
        );
        track('subscribe_claimed', { source: data.source, status: data.status });
      } catch (err) {
        if (!cancelled) {
          setStatus('error');
          setMessage(err.message || 'Could not confirm your subscription.');
        }
      }
    }

    run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, loading, user?.uid, sessionId]);

  const loginHref = `/login?redirect=${encodeURIComponent(
    `/subscribe/success${sessionId ? `?session_id=${sessionId}` : ''}`
  )}`;
  const signupHref = `/signup?redirect=${encodeURIComponent(
    `/subscribe/success${sessionId ? `?session_id=${sessionId}` : ''}`
  )}`;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <Head>
        <title>Welcome to Pro — {siteConfig.brand}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Header />

      <main className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="max-w-md w-full text-center">
          {status === 'loading' && (
            <>
              <Loader2 className="h-10 w-10 text-green-600 animate-spin mx-auto mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Confirming your subscription…</h1>
              <p className="text-gray-600 text-sm">This only takes a moment.</p>
            </>
          )}

          {status === 'success' && (
            <>
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome to Pro</h1>
              <p className="text-gray-600 text-sm mb-8">{message}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  href="/kahf-ai"
                  className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-3 rounded-lg"
                >
                  <Sparkles className="h-4 w-4" />
                  Open KAHF AI
                </Link>
                <Link
                  href="/account"
                  className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-800 font-medium px-5 py-3 rounded-lg hover:bg-gray-50"
                >
                  Account settings
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </>
          )}

          {status === 'needs_auth' && (
            <>
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <LogIn className="h-7 w-7 text-green-600" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">One quick step</h1>
              <p className="text-gray-600 text-sm mb-8">
                Payment received. Sign in or create a free account with the <strong>same email</strong> you used at checkout — Pro unlocks automatically.
              </p>
              <div className="flex flex-col gap-3">
                <Link
                  href={loginHref}
                  className="inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold px-5 py-3 rounded-lg"
                >
                  Sign in to unlock Pro
                </Link>
                <Link
                  href={signupHref}
                  className="inline-flex items-center justify-center gap-2 border border-gray-300 text-gray-800 font-medium px-5 py-3 rounded-lg hover:bg-gray-50"
                >
                  Create account
                </Link>
              </div>
            </>
          )}

          {status === 'error' && (
            <>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">We hit a snag</h1>
              <p className="text-gray-600 text-sm mb-6">{message}</p>
              <p className="text-gray-500 text-xs mb-6">
                If you were charged, email {siteConfig.supportEmail} and we&apos;ll activate you right away.
              </p>
              <Link href="/account" className="text-green-700 font-semibold text-sm">
                Go to account →
              </Link>
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
