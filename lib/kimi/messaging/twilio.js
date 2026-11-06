// Twilio adapter (SMS fallback). Inbound webhooks are verified with
// X-Twilio-Signature: base64(HMAC-SHA1(auth token, full URL + sorted params)).
// Production US traffic requires A2P 10DLC registration; set
// TWILIO_MESSAGING_SERVICE_SID to send through the registered campaign.

import crypto from 'crypto';
import { KIMI_CONFIG } from '../kimi.config.js';
import { normalizePhone, timingSafeEqualStr } from '../crypto.js';
import { clockNow } from '../runtime.js';

export function twilioSignature(authToken, url, params = {}) {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, key) => acc + key + (params[key] ?? ''), url);
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

export class TwilioProvider {
  constructor(opts = {}) {
    this.name = 'twilio';
    this.channel = 'sms';
    this.accountSid = opts.accountSid ?? process.env.TWILIO_ACCOUNT_SID ?? '';
    this.authToken = opts.authToken ?? process.env.TWILIO_AUTH_TOKEN ?? '';
    this.fromNumber = opts.fromNumber ?? (process.env.TWILIO_FROM_NUMBER || process.env.TWILIO_PHONE_NUMBER || '');
    this.messagingServiceSid = opts.messagingServiceSid ?? process.env.TWILIO_MESSAGING_SERVICE_SID ?? '';
    this.fetch = opts.fetch || globalThis.fetch;
  }

  get configured() {
    return Boolean(this.accountSid && this.authToken && (this.fromNumber || this.messagingServiceSid));
  }

  // Twilio signs the exact URL it called. Behind a proxy that can be the
  // forwarded host or the configured public base URL, so try both.
  _candidateUrls(req) {
    const headers = req?.headers || {};
    const path = req?.url || '';
    const urls = new Set();
    const host = headers['x-forwarded-host'] || headers.host;
    if (host) {
      const proto = String(headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
      urls.add(`${proto}://${host}${path}`);
    }
    urls.add(`${KIMI_CONFIG.publicBaseUrl}${path}`);
    return [...urls];
  }

  verifySignature(req) {
    if (!this.authToken) return false;
    const signature = req?.headers?.['x-twilio-signature'];
    if (!signature) return false;
    const params = req.body && typeof req.body === 'object' ? req.body : {};
    if (this.accountSid && params.AccountSid && params.AccountSid !== this.accountSid) return false;
    return this._candidateUrls(req).some((url) => timingSafeEqualStr(signature, twilioSignature(this.authToken, url, params)));
  }

  parseInbound(req) {
    const body = req?.body || {};
    const media = [];
    const count = parseInt(body.NumMedia || '0', 10) || 0;
    for (let i = 0; i < count; i += 1) {
      if (body[`MediaUrl${i}`]) media.push(String(body[`MediaUrl${i}`]));
    }
    return {
      providerMessageId: String(body.MessageSid || body.SmsMessageSid || '').trim(),
      from: normalizePhone(body.From),
      text: String(body.Body ?? '').trim(),
      media,
      receivedAt: clockNow().toISOString(),
      channel: 'sms'
    };
  }

  parseStatus(req) {
    const body = req?.body || {};
    const status = String(body.MessageStatus || body.SmsStatus || '').toLowerCase();
    return {
      providerMessageId: String(body.MessageSid || '').trim(),
      status: status === 'delivered' ? 'delivered' : status === 'failed' || status === 'undelivered' ? 'failed' : 'sent',
      errorCode: body.ErrorCode ? String(body.ErrorCode) : null,
      errorMessage: null,
      channel: 'sms'
    };
  }

  async send(to, text, mediaUrl = null, { statusCallback = null } = {}) {
    const number = normalizePhone(to);
    if (!number) throw Object.assign(new Error('Invalid recipient'), { code: 'INVALID_RECIPIENT' });
    if (!this.configured) throw Object.assign(new Error('Twilio credentials are not configured'), { code: 'TWILIO_NOT_CONFIGURED' });
    const form = new URLSearchParams();
    form.set('To', number);
    if (this.messagingServiceSid) form.set('MessagingServiceSid', this.messagingServiceSid);
    else form.set('From', this.fromNumber);
    form.set('Body', text);
    if (mediaUrl) form.set('MediaUrl', mediaUrl);
    if (statusCallback) form.set('StatusCallback', statusCallback);
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64');
    const res = await this.fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(this.accountSid)}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString()
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.message || `Twilio HTTP ${res.status}`), {
        code: data.code ? String(data.code) : `HTTP_${res.status}`
      });
    }
    return { providerMessageId: data.sid || null, status: 'sent', channel: 'sms' };
  }
}
