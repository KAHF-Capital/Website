const { Resend } = require('resend');
const { buildUnsubscribeUrl } = require('./unsubscribe');

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

const STRUCTURE_LABELS = { call: 'Long Call', put: 'Long Put', straddle: 'ATM Straddle' };

const LEGAL_DISCLAIMER = `KAHF Capital LLC is not a registered investment adviser, broker-dealer, or financial planner. All alerts, reads, and straddle data are for informational purposes only and do not constitute investment advice, a recommendation, or a solicitation to buy, sell, or hold any security, option, or financial instrument. Data is derived from third-party sources believed reliable but not guaranteed. Past performance is not indicative of future results. Backtested data has inherent limitations including hindsight bias and does not reflect real execution conditions such as slippage, commissions, or liquidity constraints. Trading options involves substantial risk of loss, including loss of your entire investment. Nothing herein creates a fiduciary relationship. Consult a qualified professional before investing. KAHF Capital may hold positions in referenced securities. Use at your own risk.`;

function fmtExpiration(iso) {
  try {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

// Dark-styled cards for Trade-grade reads — the headline section of the digest.
function renderReadCards(reads) {
  return reads.map((r) => {
    const label = STRUCTURE_LABELS[r.structure] || r.structure;
    const row = (k, v) =>
      `<tr><td style="padding:5px 0;color:#707080;font-size:13px">${k}</td><td style="padding:5px 0;color:#e0e0e0;font-size:13px;font-weight:600;text-align:right">${v}</td></tr>`;
    return [
      `<div style="background:#10101e;border:1px solid #00d4aa33;border-radius:10px;padding:18px 20px;margin:0 0 14px">`,
      `<div style="margin-bottom:10px"><span style="color:#e0e0e0;font-size:20px;font-weight:800">${r.ticker}</span>`,
      `<span style="background:#0a2a22;color:#00d4aa;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-radius:5px;padding:3px 8px;margin-left:10px">${label}</span></div>`,
      `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">`,
      row('Strike', `$${r.strike}`),
      row('Expiration', `${fmtExpiration(r.expiration)} (${r.dte}d)`),
      row('Entry premium', `$${Number(r.entry_premium).toFixed(2)}`),
      row('Dark pool conviction', `${r.volume_ratio}&times; normal volume`),
      row('Historical edge (as-of)', `${r.asof_hit_rate}% over ${r.asof_samples} samples`),
      `</table></div>`
    ].join('');
  }).join('');
}

// Build the daily digest (subject + html + text). When `newReads` is non-empty
// the read leads the email and the scanner table becomes supporting context.
// Exported separately so it can be previewed/tested without sending.
function buildDailyDigestEmail(tickers, date, isQuietDay = false, newReads = [], unsubscribeUrl = null) {
  const hasReads = newReads.length > 0;

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

  // Headline: read first when there is one, scanner digest otherwise.
  let heading, headingColor, subtitle;
  if (hasReads) {
    heading = newReads.length === 1 ? '🎯 KAHF AI found a tradeable read' : `🎯 KAHF AI found ${newReads.length} tradeable reads`;
    headingColor = '#00d4aa';
    subtitle = `${date} &middot; Structure, strike, and expiry below &mdash; marked live on the track record from today onward`;
  } else if (isQuietDay) {
    heading = 'Dark Pool Daily Recap';
    headingColor = '#a0a0b0';
    subtitle = `${date} &middot; No tickers above 3x volume ratio &mdash; here are today's top ${sorted.length} by volume ratio`;
  } else {
    heading = '🔥 Dark Pool Alert';
    headingColor = '#00d4aa';
    subtitle = `${date} &middot; ${sorted.length} tickers at 3x+ volume ratio`;
  }

  const quietBanner = isQuietDay && !hasReads
    ? `<div style="background:#1a1a10;border:1px solid #3a3a20;border-radius:6px;padding:10px 14px;margin:0 0 20px;color:#f0c040;font-size:13px;text-align:center">No significant dark pool spikes today — showing top tickers by volume ratio for context</div>`
    : '';

  const readsSection = hasReads
    ? [
        renderReadCards(newReads),
        `<p style="margin:4px 0 24px;text-align:center"><a href="${SITE_URL}/wins" style="background:#00d4aa;color:#0a0a14;font-size:14px;font-weight:700;text-decoration:none;border-radius:8px;padding:11px 22px;display:inline-block">See the live track record &rarr;</a><br/><a href="${SITE_URL}/kahf-ai" style="color:#707080;font-size:12px;display:inline-block;margin-top:10px">Ask KAHF AI why it flagged ${newReads[0].ticker} &rarr;</a></p>`,
        `<hr style="border:none;border-top:1px solid #1a1a2e;margin:0 0 20px"/>`,
        `<h2 style="color:#a0a0b0;font-size:14px;margin:0 0 12px;text-transform:uppercase;letter-spacing:.5px">Today's dark pool activity</h2>`
      ].join('')
    : '';

  const th = `padding:8px 10px;text-align:left;color:#707080;font-size:11px;text-transform:uppercase;letter-spacing:.5px;white-space:nowrap`;
  const d = `color:#35354a;font-size:9px;line-height:1.4`;

  const html = [
    `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/><meta name="x-apple-disable-message-reformatting"/>`,
    `<style>body,table,td,p,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}body{margin:0;padding:0;width:100%!important}@media(max-width:620px){.i{padding:16px!important}.dt td,.dt th{padding:5px 6px!important;font-size:11px!important}}</style></head>`,
    `<body style="margin:0;padding:0;background:#0a0a14;width:100%!important">`,
    `<table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a14"><tr><td align="center">`,
    `<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">`,
    `<tr><td class="i" style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">`,
    `<h1 style="color:${headingColor};font-size:20px;margin:0 0 4px">${heading}</h1>`,
    `<p style="color:#707080;margin:0 0 20px;font-size:14px">${subtitle}</p>`,
    readsSection,
    quietBanner,
    `<table class="dt" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#10101e;border-radius:8px">`,
    `<tr style="background:#141428"><th style="${th}">Ticker</th><th style="${th}">Price</th><th style="${th}">Vol Ratio</th><th style="${th}">Notional</th>${straddleHeader}</tr>`,
    rows,
    `</table>`,
    hasStraddle ? `<p style="color:#505060;font-size:11px;margin:14px 0 0;text-align:center">Straddle = ATM straddle success rate (~30d expiry)</p>` : '',
    `<p style="margin:20px 0 0;text-align:center"><a href="${SITE_URL}/scanner" style="color:#00d4aa;font-size:14px">View full scanner &rarr;</a></p>`,
    `<p style="color:#404050;font-size:11px;margin:20px 0 0;text-align:center">KAHF Capital${unsubscribeUrl ? ` &nbsp;&middot;&nbsp; <a href="${unsubscribeUrl}" style="color:#505060;text-decoration:underline">Unsubscribe</a>` : ''}</p>`,
    `<hr style="border:none;border-top:1px solid #1a1a2e;margin:20px 0 16px"/>`,
    `<p style="${d}">${hasReads ? 'Reads are not trade recommendations. ' : ''}${LEGAL_DISCLAIMER}</p>`,
    `</td></tr></table></td></tr></table></body></html>`
  ].join('');

  // Plain-text fallback
  const readLines = newReads.map((r) => {
    const label = STRUCTURE_LABELS[r.structure] || r.structure;
    return `${r.ticker} ${label} $${r.strike} exp ${r.expiration} · entry $${Number(r.entry_premium).toFixed(2)} · ${r.volume_ratio}x dark pool · edge ${r.asof_hit_rate}%`;
  }).join('\n');

  const plainLines = sorted.map(t => {
    const rate = t.straddleRate != null ? ` | Straddle: ${t.straddleRate}%` : '';
    return `${t.ticker} — ${t.volume_ratio}x${rate}`;
  }).join('\n');
  const siteHost = SITE_URL.replace(/^https?:\/\//, '');

  const textHeader = hasReads
    ? `KAHF AI – New tradeable read${newReads.length > 1 ? 's' : ''} – ${date}\n\n${readLines}\n\nTrack record: ${siteHost}/wins\n\n--- Today's dark pool activity ---`
    : isQuietDay
      ? `KAHF Dark Pool Recap – ${date}\nNo tickers above 3x — top ${sorted.length} by volume ratio:`
      : `KAHF Dark Pool Alert – ${date}\n3x+ Volume Ratio (${sorted.length} total):`;
  const unsubText = unsubscribeUrl ? `\n\nUnsubscribe: ${unsubscribeUrl}` : '';
  const text = `${textHeader}\n\n${plainLines}\n\n${siteHost}/scanner${unsubText}\n\n---\n${LEGAL_DISCLAIMER}`;

  let subject;
  if (hasReads) {
    const first = newReads[0];
    subject = newReads.length === 1
      ? `🎯 New KAHF AI read: ${first.ticker} ${STRUCTURE_LABELS[first.structure] || first.structure} — Digest ${date}`
      : `🎯 ${newReads.length} new KAHF AI reads (${newReads.map((r) => r.ticker).join(', ')}) — Digest ${date}`;
  } else if (isQuietDay) {
    subject = `Dark Pool Recap – ${date} (quiet day)`;
  } else {
    subject = `🔥 Dark Pool Alert – ${date} (${sorted.length} tickers at 3x+)`;
  }

  return { subject, html, text };
}

async function sendDailyDigestEmail(toEmail, tickers, date, isQuietDay = false, newReads = []) {
  try {
    const resend = getClient();
    const unsubscribeUrl = buildUnsubscribeUrl(toEmail);
    const { subject, html, text } = buildDailyDigestEmail(tickers, date, isQuietDay, newReads, unsubscribeUrl);

    // RFC 8058 one-click unsubscribe headers — required by Gmail/Yahoo for
    // bulk senders and a strong deliverability signal.
    const headers = unsubscribeUrl
      ? {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
        }
      : undefined;

    const { data, error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: toEmail,
      subject,
      html,
      text,
      headers
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

module.exports = { sendDailyDigestEmail, buildDailyDigestEmail };
