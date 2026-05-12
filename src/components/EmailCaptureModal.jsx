import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, X, Lock, CheckCircle2, Loader2 } from 'lucide-react';
import { track, readReferralCookie } from '../../lib/analytics';

export default function EmailCaptureModal({
  open,
  onClose,
  onSuccess,
  source = 'modal',
  ticker = null,
  title = 'Unlock the full scanner',
  subtitle = 'Free forever. No credit card. Get instant access to historical dark pool data and daily AI-graded setups.',
  cta = 'Get free access'
}) {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail('');
      setError('');
      setSuccess(false);
      setSubmitting(false);
      track('email_capture_opened', { source, ticker: ticker || undefined });
    }
  }, [open, source, ticker]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/email-capture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          ticker,
          refCode: readReferralCookie()
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not submit. Try again.');
      track('email_capture_submitted', { source, ticker: ticker || undefined });
      try {
        window.localStorage.setItem('kahf_lead_email', email.trim().toLowerCase());
      } catch {}
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.(email.trim().toLowerCase());
        onClose?.();
      }, 900);
    } catch (err) {
      setError(err.message);
      track('email_capture_error', { source, message: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-7 relative"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 p-1"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center mb-4">
              <Lock className="h-6 w-6 text-green-600" />
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
            <p className="text-gray-600 mb-5 leading-relaxed">{subtitle}</p>

            {success ? (
              <div className="flex items-center gap-2 p-4 bg-green-50 border border-green-200 rounded-lg text-green-800">
                <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                <span className="text-sm font-medium">You're in. Check your inbox.</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                  <input
                    type="email"
                    autoFocus
                    required
                    placeholder="you@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-600">{error}</p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-semibold px-6 py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {submitting ? 'Sending…' : cta}
                </button>
                <p className="text-xs text-gray-500 text-center">
                  We'll never share your email. Unsubscribe any time.
                </p>
              </form>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
