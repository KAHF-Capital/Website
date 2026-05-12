// Lightweight email-lead capture for the gated scanner / homepage / wins page.
// Writes to Firestore (collection: leads) when admin is configured, and triggers
// an onboarding email sequence via Resend.
import { sendOnboardingEmail } from '../../lib/onboarding-email';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, source, refCode, ticker } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !EMAIL_RE.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const lead = {
      email: normalizedEmail,
      source: String(source || 'unknown').slice(0, 64),
      refCode: refCode ? String(refCode).slice(0, 64) : null,
      ticker: ticker ? String(ticker).toUpperCase().slice(0, 8) : null,
      ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || null,
      userAgent: req.headers['user-agent'] || null,
      createdAt: new Date().toISOString()
    };

    let stored = false;
    if (firebaseAdmin && firebaseAdmin.isFirebaseAdminConfigured && firebaseAdmin.isFirebaseAdminConfigured()) {
      try {
        const firestore = firebaseAdmin.getFirestoreAdmin();
        const docId = Buffer.from(normalizedEmail).toString('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 64);
        await firestore.collection('leads').doc(docId).set(lead, { merge: true });
        stored = true;
      } catch (err) {
        console.error('[email-capture] Firestore error:', err.message);
      }
    }

    // Fire-and-forget welcome email (don't block the response)
    sendOnboardingEmail({ email: normalizedEmail, step: 'welcome', source: lead.source })
      .catch((err) => console.error('[email-capture] welcome email failed:', err.message));

    return res.status(200).json({ ok: true, stored });
  } catch (err) {
    console.error('[email-capture] unexpected error:', err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
