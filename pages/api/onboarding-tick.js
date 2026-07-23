// Cron-triggered endpoint to drip onboarding emails (day 1 / 3 / 7).
// Schedule via vercel.json cron daily at 14:00 UTC.
// Protected by ADMIN_SECRET to prevent abuse.
import { sendOnboardingEmail } from '../../lib/onboarding-email';

let firebaseAdmin = null;
try {
  firebaseAdmin = require('../../lib/firebase-admin');
} catch (e) {}

const STEP_AT_DAY = { 1: 'day1', 3: 'day3', 7: 'day7' };

function daysBetween(iso) {
  if (!iso) return 0;
  const ms = Date.now() - new Date(iso).getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export default async function handler(req, res) {
  const adminSecret = process.env.ADMIN_SECRET;
  const authHeader = req.headers.authorization || '';
  const isVercelCron = req.headers['x-vercel-cron'] === 'true';
  const isAuthorized =
    isVercelCron ||
    (adminSecret && authHeader === `Bearer ${adminSecret}`);

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!firebaseAdmin || !firebaseAdmin.isFirebaseAdminConfigured || !firebaseAdmin.isFirebaseAdminConfigured()) {
    return res.status(503).json({ error: 'Firebase admin not configured' });
  }

  try {
    const firestore = firebaseAdmin.getFirestoreAdmin();
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - 8);
    const snap = await firestore
      .collection('leads')
      .where('createdAt', '>=', since.toISOString())
      .limit(500)
      .get();

    let sent = 0;
    let skipped = 0;
    const results = [];
    for (const doc of snap.docs) {
      const lead = doc.data();
      const dayN = daysBetween(lead.createdAt);
      const step = STEP_AT_DAY[dayN];
      if (!step) { skipped++; continue; }
      const sentSteps = lead.sentSteps || {};
      if (sentSteps[step]) { skipped++; continue; }

      const result = await sendOnboardingEmail({ email: lead.email, step, source: lead.source });
      results.push({ email: lead.email, step, success: result.success });
      if (result.success) {
        sent++;
        await doc.ref.update({ [`sentSteps.${step}`]: new Date().toISOString() });
      }
    }

    return res.status(200).json({ ok: true, sent, skipped, total: snap.size, results });
  } catch (err) {
    console.error('[onboarding-tick] error:', err);
    return res.status(500).json({ error: err.message });
  }
}
