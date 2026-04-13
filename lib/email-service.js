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

async function sendDailyDigestEmail(toEmail, tickers, date, isQuietDay = false) {
  try {
    const resend = getClient();

    const sorted = isQuietDay
      ? [...tickers]
      : [...tickers].sort((a, b) => parseFloat(b.volume_ratio) - parseFloat(a.volume_ratio));

    const hasStraddle = sorted.some(t => t.straddleRate != null);

    const rows = sorted.map(t => {
      const ratio = parseFloat(t.volume_ratio);
      const val = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(t.total_value);
      const heat = ratio >= 5 ? '🔥🔥' : ratio >= 3 ? '🔥' : '';

      let straddleCell = '';
      if (hasStraddle) {
        const rate = t.straddleRate;
        const dte = t.straddleDTE;
        let color = '#a0a0b0';
        if (rate != null) {
          color = rate >= 60 ? '#00d4aa' : rate >= 40 ? '#f0c040' : '#ff5060';
        }
        const label = rate != null ? `${rate}%` : '—';
        const dteLabel = dte != null ? ` <span style="color:#505060;font-size:11px">(${dte}d)</span>` : '';
        straddleCell = `<td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;color:${color};font-weight:700;text-align:center">${label}${dteLabel}</td>`;
      }

      return `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;font-weight:600;color:#e0e0e0">${t.ticker}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;color:#00d4aa;font-weight:700">${t.volume_ratio}x ${heat}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #1a1a2e;color:#a0a0b0">${val}</td>
        ${straddleCell}
      </tr>`;
    }).join('');

    const straddleHeader = hasStraddle
      ? `<th style="padding:10px 12px;text-align:center;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Straddle</th>`
      : '';

    const heading = isQuietDay ? 'Dark Pool Daily Recap' : '🔥 Dark Pool Alert';
    const subtitle = isQuietDay
      ? `${date} &middot; No tickers above 3x volume ratio &mdash; here are today's top ${sorted.length} by volume`
      : `${date} &middot; ${sorted.length} tickers at 3x+ volume ratio`;
    const quietBanner = isQuietDay
      ? `<div style="background:#1a1a10;border:1px solid #3a3a20;border-radius:6px;padding:10px 14px;margin:0 0 20px;color:#f0c040;font-size:13px;text-align:center">No significant dark pool spikes today — showing top tickers by volume for context</div>`
      : '';

    const html = `
    <div style="background:#0a0a14;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <div style="max-width:${hasStraddle ? '600' : '520'}px;margin:0 auto">
        <h1 style="color:${isQuietDay ? '#a0a0b0' : '#00d4aa'};font-size:20px;margin:0 0 4px">${heading}</h1>
        <p style="color:#707080;margin:0 0 24px;font-size:14px">${subtitle}</p>
        ${quietBanner}
        <table style="width:100%;border-collapse:collapse;background:#10101e;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#141428">
              <th style="padding:10px 12px;text-align:left;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Ticker</th>
              <th style="padding:10px 12px;text-align:left;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Vol Ratio</th>
              <th style="padding:10px 12px;text-align:left;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Notional</th>
              ${straddleHeader}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${hasStraddle ? `<p style="color:#505060;font-size:11px;margin:16px 0 0;text-align:center">Straddle = ATM straddle success rate (~30d expiry, 25+ historical periods)</p>` : ''}
        <p style="margin:24px 0 0;text-align:center">
          <a href="${SITE_URL}/scanner" style="color:#00d4aa;font-size:14px">View full scanner →</a>
        </p>
        <p style="color:#404050;font-size:11px;margin:24px 0 0;text-align:center">KAHF Capital &middot; Dark Pool Scanner</p>
      </div>
    </div>`;

    const plainLines = sorted.map(t => {
      const rate = t.straddleRate != null ? ` | Straddle: ${t.straddleRate}%` : '';
      return `${t.ticker} — ${t.volume_ratio}x${rate}`;
    }).join('\n');
    const siteHost = SITE_URL.replace(/^https?:\/\//, '');

    const textHeader = isQuietDay
      ? `KAHF Dark Pool Recap – ${date}\nNo tickers above 3x — top ${sorted.length} by volume:`
      : `KAHF Dark Pool Alert – ${date}\n3x+ Volume Ratio (${sorted.length} total):`;
    const text = `${textHeader}\n\n${plainLines}\n\n${siteHost}/scanner`;

    const subject = isQuietDay
      ? `Dark Pool Recap – ${date} (quiet day)`
      : `🔥 Dark Pool Alert – ${date} (${sorted.length} tickers at 3x+)`;

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject,
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
