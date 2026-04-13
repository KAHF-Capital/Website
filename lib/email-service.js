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
        straddleCell = `<td style="padding:8px 10px;border-bottom:1px solid #1a1a2e;color:${color};font-weight:700;text-align:center">${label}${dteLabel}</td>`;
      }

      const price = t.avg_price ? `$${parseFloat(t.avg_price).toFixed(2)}` : '—';
      const b = `padding:8px 10px;border-bottom:1px solid #1a1a2e`;
      return `<tr><td style="${b};font-weight:600;color:#e0e0e0">${t.ticker}</td><td style="${b};color:#e0e0e0;white-space:nowrap">${price}</td><td style="${b};color:#00d4aa;font-weight:700;white-space:nowrap">${t.volume_ratio}x ${heat}</td><td style="${b};color:#a0a0b0;white-space:nowrap">${val}</td>${straddleCell}</tr>`;
    }).join('');

    const straddleHeader = hasStraddle
      ? `<th style="padding:10px 12px;text-align:center;color:#707080;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Straddle</th>`
      : '';

    const heading = isQuietDay ? 'Dark Pool Daily Recap' : '🔥 Dark Pool Alert';
    const subtitle = isQuietDay
      ? `${date} &middot; No tickers above 3x volume ratio &mdash; here are today's top ${sorted.length} by volume ratio`
      : `${date} &middot; ${sorted.length} tickers at 3x+ volume ratio`;
    const quietBanner = isQuietDay
      ? `<div style="background:#1a1a10;border:1px solid #3a3a20;border-radius:6px;padding:10px 14px;margin:0 0 20px;color:#f0c040;font-size:13px;text-align:center">No significant dark pool spikes today — showing top tickers by volume ratio for context</div>`
      : '';

    const th = `padding:8px 10px;text-align:left;color:#707080;font-size:11px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap`;
    const d = `color:#35354a;font-size:9px;line-height:1.4`;

    const parts = [
      `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="x-apple-disable-message-reformatting"/>`,
      `<style>body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}body{margin:0;padding:0;width:100%!important}@media(max-width:620px){.i{padding:16px!important}.dt td,.dt th{padding:5px 6px!important;font-size:11px!important}}</style></head>`,
      `<body style="margin:0;padding:0;background:#0a0a14;width:100%!important">`,
      `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14"><tr><td align="center">`,
      `<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">`,
      `<tr><td class="i" style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">`,
      `<h1 style="color:${isQuietDay ? '#a0a0b0' : '#00d4aa'};font-size:20px;margin:0 0 4px">${heading}</h1>`,
      `<p style="color:#707080;margin:0 0 20px;font-size:14px">${subtitle}</p>`,
      quietBanner,
      `<table class="dt" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#10101e;border-radius:8px">`,
      `<tr style="background:#141428"><th style="${th}">Ticker</th><th style="${th}">Price</th><th style="${th}">Vol Ratio</th><th style="${th}">Notional</th>${straddleHeader}</tr>`,
      rows,
      `</table>`,
      hasStraddle ? `<p style="color:#505060;font-size:11px;margin:14px 0 0;text-align:center">Straddle = ATM straddle success rate (~30d expiry)</p>` : '',
      `<p style="margin:20px 0 0;text-align:center"><a href="${SITE_URL}/scanner" style="color:#00d4aa;font-size:14px">View full scanner &rarr;</a></p>`,
      `<p style="color:#404050;font-size:11px;margin:20px 0 0;text-align:center">KAHF Capital</p>`,
      `<hr style="border:none;border-top:1px solid #1a1a2e;margin:20px 0 16px"/>`,
      `<p style="${d}">KAHF Capital LLC is not a registered investment adviser, broker-dealer, or financial planner. All alerts and straddle data are for informational purposes only and do not constitute investment advice. Data is derived from third-party sources believed reliable but not guaranteed. Past performance is not indicative of future results. Backtested data has inherent limitations including hindsight bias and does not reflect real execution conditions. Trading options involves substantial risk of loss. Nothing herein creates a fiduciary relationship. Consult a qualified professional before investing. KAHF Capital may hold positions in referenced securities. Use at your own risk.</p>`,
      `</td></tr></table></td></tr></table></body></html>`
    ];

    const html = parts.join('');

    const plainLines = sorted.map(t => {
      const rate = t.straddleRate != null ? ` | Straddle: ${t.straddleRate}%` : '';
      return `${t.ticker} — ${t.volume_ratio}x${rate}`;
    }).join('\n');
    const siteHost = SITE_URL.replace(/^https?:\/\//, '');

    const textHeader = isQuietDay
      ? `KAHF Dark Pool Recap – ${date}\nNo tickers above 3x — top ${sorted.length} by volume ratio:`
      : `KAHF Dark Pool Alert – ${date}\n3x+ Volume Ratio (${sorted.length} total):`;
    const disclaimer = `\n\n---\nKAHF Capital LLC is not a registered investment adviser, broker-dealer, or financial planner. The dark pool volume alerts and associated options straddle performance data provided by this service are for informational and educational purposes only and do not constitute investment advice, a recommendation, or a solicitation to buy, sell, or hold any security, option, or financial instrument. Alerts are derived from publicly reported data and third-party sources believed to be reliable but not guaranteed for accuracy or completeness. Past performance is not indicative of future results. Backtested performance has inherent limitations, including hindsight bias, and does not account for slippage, commissions, liquidity constraints, or real-world execution conditions. Trading securities and options involves substantial risk of loss, including loss of your entire investment. Options carry additional risks including leverage, time decay, and illiquidity. Nothing in this communication creates a fiduciary relationship. You should consult a qualified financial professional before making any investment decisions. KAHF Capital and its affiliates may hold positions in securities referenced herein and have no obligation to disclose such holdings. Use of this service is at your own risk.`;
    const text = `${textHeader}\n\n${plainLines}\n\n${siteHost}/scanner${disclaimer}`;

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
