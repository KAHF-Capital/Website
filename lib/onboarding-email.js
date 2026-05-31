// Onboarding email sequence helpers (Resend).
// Day 0 (welcome), 1 (how to use the scanner), 3 (KAHF AI demo), 7 (upgrade nudge via /pricing).

const { Resend } = require('resend');

let resendClient = null;
function getClient() {
  if (!resendClient) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY not configured');
    resendClient = new Resend(key);
  }
  return resendClient;
}

const FROM_ADDRESS = process.env.RESEND_FROM || 'KAHF Capital <hello@kahfcapital.com>';
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com';
const PRO_URL = process.env.NEXT_PUBLIC_STRIPE_CHECKOUT_MONTHLY || 'https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01';

const STEPS = {
  welcome: {
    subject: 'Welcome to KAHF AI — your edge starts here',
    body: ({ email }) => `
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">Welcome to KAHF AI.</h1>
      <p style="color:#333;line-height:1.6">You just unlocked the same dark pool data the desks use, plus an AI volatility analyst that finds the best volatility play on any ticker — in plain English.</p>
      <p style="color:#333;line-height:1.6"><strong>Try it now:</strong></p>
      <ul style="color:#333;line-height:1.7">
        <li>Ask <em>"Find me a high-conviction trade right now"</em> on <a href="${SITE_URL}/kahf-ai" style="color:#059669">KAHF AI</a>.</li>
        <li>Browse today's institutional prints on the <a href="${SITE_URL}/scanner" style="color:#059669">free scanner</a>.</li>
        <li>Score any ticker against ~3 years of historical moves with the <a href="${SITE_URL}/calculator" style="color:#059669">volatility calculator</a>.</li>
      </ul>
      <p style="color:#333;line-height:1.6">When you're ready for unlimited KAHF AI, full scanner history, and the daily unusual dark pool email digest, <a href="${SITE_URL}/pricing" style="color:#059669"><strong>start a 7-day free trial</strong></a>. Cancel any time.</p>
      <p style="color:#888;font-size:12px;line-height:1.6;margin-top:24px">You're getting this because you signed up at ${SITE_URL}. Reply STOP to stop.</p>
    `
  },
  day1: {
    subject: 'How to read the scanner in 60 seconds',
    body: () => `
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">Three numbers that matter on the scanner.</h1>
      <p style="color:#333;line-height:1.6"><strong>Volume ratio.</strong> Today's dark pool volume vs the trailing 7-day average. 3x or higher = institutions are positioning.</p>
      <p style="color:#333;line-height:1.6"><strong>Best-strategy hit rate.</strong> KAHF AI evaluates every volatility setup on a ticker and picks whichever has the highest historical hit rate at ~30 DTE. 55%+ means the move is large enough to pay for the premium.</p>
      <p style="color:#333;line-height:1.6"><strong>Catalyst.</strong> Earnings, FDA, M&amp;A, analyst action. No catalyst = no edge.</p>
      <p style="color:#333;line-height:1.6">Want all four checks scored automatically? <a href="${SITE_URL}/kahf-ai" style="color:#059669">Ask KAHF AI to grade today's setups.</a></p>
    `
  },
  day3: {
    subject: 'Here\'s what KAHF AI did with NVDA earnings',
    body: () => `
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">A real KAHF AI session.</h1>
      <p style="color:#333;line-height:1.6"><em>"What's the strongest setup right now?"</em> — 1 question, 30 seconds, full read with volume ratio, success rate, liquidity, catalyst, and a structured trade idea.</p>
      <p style="color:#333;line-height:1.6"><a href="${SITE_URL}/kahf-ai" style="color:#059669"><strong>Try it free →</strong></a></p>
    `
  },
  day7: {
    subject: 'Unlock Pro — unlimited KAHF AI',
    body: () => `
      <h1 style="color:#111;font-size:22px;margin:0 0 12px">Pro = unlimited reads + history + daily digest.</h1>
      <p style="color:#333;line-height:1.6">You've had a week with the scanner. Pro adds <strong>unlimited KAHF AI chat</strong>, <strong>full scanner history</strong>, and a <strong>daily email</strong> when dark pool activity is unusually high — all with a 7-day free trial and 14-day money-back guarantee.</p>
      <p style="color:#333;line-height:1.6"><a href="${SITE_URL}/pricing" style="color:#059669"><strong>Compare plans →</strong></a> &nbsp;·&nbsp; <a href="${PRO_URL}" style="color:#059669"><strong>Start checkout →</strong></a></p>
      <p style="color:#888;font-size:12px;line-height:1.6;margin-top:24px">Cancel any time.</p>
    `
  }
};

function wrap(html) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
        <tr><td style="padding:32px">${html}</td></tr>
      </table>
      <p style="color:#9ca3af;font-size:11px;margin:16px 0 0">KAHF Capital LLC · Educational only · Not investment advice</p>
    </td></tr></table>
  </body></html>`;
}

async function sendOnboardingEmail({ email, step = 'welcome', source = 'unknown' }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[onboarding-email] RESEND_API_KEY missing — skipping send');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }
  const tpl = STEPS[step];
  if (!tpl) return { success: false, error: `Unknown step: ${step}` };

  try {
    const { data, error } = await getClient().emails.send({
      from: FROM_ADDRESS,
      to: email,
      subject: tpl.subject,
      html: wrap(tpl.body({ email, source }))
    });
    if (error) {
      console.error(`[onboarding-email] ${step} failed for ${email}:`, error);
      return { success: false, error: error.message || JSON.stringify(error) };
    }
    return { success: true, emailId: data?.id };
  } catch (err) {
    console.error(`[onboarding-email] ${step} threw for ${email}:`, err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { sendOnboardingEmail, STEPS };
