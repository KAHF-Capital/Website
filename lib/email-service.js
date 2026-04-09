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

const FROM_ADDRESS = process.env.RESEND_FROM || 'KAHF Capital <alerts@kahfcapital.com>';
const SITE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://www.kahfcapital.com';

async function sendDailyDigestEmail(toEmail, tickers, date) {
  try {
    const resend = getClient();

    const sorted = [...tickers].sort((a, b) => parseFloat(b.volume_ratio) - parseFloat(a.volume_ratio));

    const rows = sorted.map(t => {
      const ratio = parseFloat(t.volume_ratio);
      const val = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(t.total_value);
      const heat = ratio >= 5 ? '🔥🔥' : ratio >= 3 ? '🔥' : '';
      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;font-weight:600;color:#e0e0e0">${t.ticker}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;color:#00d4aa;font-weight:700">${t.volume_ratio}x ${heat}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;color:#a0a0b0">${val}</td>
      </tr>`;
    }).join('');

    const html = `
    <div style="background:#0a0a14;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="max-width:520px;margin:0 auto">
        <h1 style="color:#00d4aa;font-size:20px;margin:0 0 4px">🔥 Dark Pool Alert</h1>
        <p style="color:#707080;margin:0 0 24px;font-size:14px">${date} &middot; ${sorted.length} tickers at 3x+ volume ratio</p>
        <table style="width:100%;border-collapse:collapse;background:#10101e;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#141428">
              <th style="padding:10px 12px;text-align:left;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Ticker</th>
              <th style="padding:10px 12px;text-align:left;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Vol Ratio</th>
              <th style="padding:10px 12px;text-align:left;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Notional</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <p style="margin:24px 0 0;text-align:center">
          <a href="${SITE_URL}/scanner" style="color:#00d4aa;font-size:14px">View full scanner →</a>
        </p>
        <p style="color:#404050;font-size:11px;margin:24px 0 0;text-align:center">KAHF Capital &middot; Dark Pool Scanner</p>
      </div>
    </div>`;

    const plainLines = sorted.map(t => `${t.ticker} — ${t.volume_ratio}x`).join('\n');
    const siteHost = SITE_URL.replace(/^https?:\/\//, '');
    const text = `KAHF Dark Pool Alert – ${date}\n3x+ Volume Ratio (${sorted.length} total):\n\n${plainLines}\n\n${siteHost}/scanner`;

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject: `🔥 Dark Pool Alert – ${date} (${sorted.length} tickers at 3x+)`,
      html,
      text
    });

    if (error) {
      console.error(`Email failed to ${toEmail}:`, error);
      return { success: false, error: error.message || JSON.stringify(error) };
    }

    console.log(`Email sent to ${toEmail}: ${data.id}`);
    return { success: true, emailId: data.id };
  } catch (error) {
    console.error(`Email failed to ${toEmail}:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = { sendDailyDigestEmail };
