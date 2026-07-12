// Unsubscribe endpoint.
//   GET  — link clicks from email footers; shows a branded confirmation page.
//   POST — RFC 8058 one-click unsubscribe (Gmail/Yahoo tap the List-Unsubscribe
//          header; body is ignored, auth is the same signed token).
import { normalizeEmail, verifyUnsubscribeToken, addUnsubscribedEmail } from '../../lib/unsubscribe';

const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com';

function page(title, message) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title} | KAHF Capital</title><meta name="robots" content="noindex"/></head>
<body style="margin:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<div style="max-width:480px;margin:80px auto;padding:0 16px;text-align:center">
  <div style="background:#fff;border:1px solid #e5e7eb;border-radius:16px;padding:40px 32px">
    <h1 style="color:#111827;font-size:22px;margin:0 0 10px">${title}</h1>
    <p style="color:#4b5563;font-size:15px;line-height:1.6;margin:0 0 24px">${message}</p>
    <a href="${SITE_URL}" style="color:#059669;font-weight:600;text-decoration:none">&larr; Back to KAHF Capital</a>
  </div>
  <p style="color:#9ca3af;font-size:11px;margin-top:16px">KAHF Capital LLC</p>
</div></body></html>`;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!process.env.UNSUBSCRIBE_SECRET) {
    return res.status(503).send(page('Temporarily unavailable', 'Unsubscribe is not configured yet. Please email info@kahfcapital.com and we\u2019ll remove you right away.'));
  }

  const email = normalizeEmail(req.query.email);
  const token = String(req.query.token || '');

  if (!email || !verifyUnsubscribeToken(email, token)) {
    if (req.method === 'POST') return res.status(400).json({ error: 'Invalid unsubscribe link' });
    return res.status(400).send(page('Link not valid', 'This unsubscribe link is invalid or expired. Please use the link from your most recent email, or contact info@kahfcapital.com.'));
  }

  try {
    await addUnsubscribedEmail(email);
  } catch (err) {
    console.error('[unsubscribe] failed to persist:', err.message);
    if (req.method === 'POST') return res.status(500).json({ error: 'Could not process unsubscribe' });
    return res.status(500).send(page('Something went wrong', 'We couldn\u2019t process that just now. Please try again, or email info@kahfcapital.com and we\u2019ll remove you manually.'));
  }

  console.log(`[unsubscribe] ${email} unsubscribed via ${req.method}`);

  if (req.method === 'POST') {
    return res.status(200).json({ success: true });
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(page('You\u2019re unsubscribed', `${email} will no longer receive KAHF alert emails. Changed your mind? Just sign up again on the site.`));
}
