// Sendblue adapter (iMessage blue bubbles, SMS downgrade handled by Sendblue).
//
// Inbound webhooks must carry the signing secret configured in the Sendblue
// dashboard (header `sb-signing-secret`). An HMAC-SHA256 signature of the raw
// body in `x-sendblue-signature` is accepted as well.

import crypto from 'crypto';
import { normalizePhone, timingSafeEqualStr } from '../crypto.js';
import { clockNow } from '../runtime.js';

const API_BASE = 'https://api.sendblue.co/api';

export class SendblueProvider {
  constructor(opts = {}) {
    this.name = 'sendblue';
    this.channel = 'imessage';
    this.apiKey = opts.apiKey ?? process.env.SENDBLUE_API_KEY ?? '';
    this.apiSecret = opts.apiSecret ?? process.env.SENDBLUE_API_SECRET ?? '';
    this.fromNumber = opts.fromNumber ?? process.env.SENDBLUE_FROM_NUMBER ?? '';
    this.webhookSecret = opts.webhookSecret ?? process.env.SENDBLUE_WEBHOOK_SECRET ?? '';
    this.fetch = opts.fetch || globalThis.fetch;
  }

  get configured() {
    return Boolean(this.apiKey && this.apiSecret);
  }

  verifySignature(req) {
    if (!this.webhookSecret) return false;
    const headers = req?.headers || {};
    const sharedSecret = headers['sb-signing-secret'];
    if (sharedSecret && timingSafeEqualStr(sharedSecret, this.webhookSecret)) return true;
    const signature = headers['x-sendblue-signature'];
    if (!signature || typeof req.rawBody !== 'string') return false;
    const expected = crypto.createHmac('sha256', this.webhookSecret).update(req.rawBody).digest('hex');
    return timingSafeEqualStr(String(signature).replace(/^sha256=/, ''), expected);
  }

  parseInbound(req) {
    const body = req?.body || {};
    const media = [];
    if (body.media_url) media.push(String(body.media_url));
    return {
      providerMessageId: String(body.message_handle || '').trim(),
      from: normalizePhone(body.from_number || body.number),
      text: String(body.content ?? '').trim(),
      media,
      receivedAt: body.date_sent ? new Date(body.date_sent).toISOString() : clockNow().toISOString(),
      channel: body.was_downgraded === true || String(body.service || '').toUpperCase() === 'SMS' ? 'sms' : 'imessage',
      isOutboundEcho: body.is_outbound === true
    };
  }

  parseStatus(req) {
    const body = req?.body || {};
    const status = String(body.status || '').toUpperCase();
    return {
      providerMessageId: String(body.message_handle || '').trim(),
      status: status === 'DELIVERED' || status === 'READ' ? 'delivered' : status === 'ERROR' || status === 'FAILED' ? 'failed' : 'sent',
      errorCode: body.error_code ? String(body.error_code) : null,
      errorMessage: body.error_message || null,
      channel: body.was_downgraded === true ? 'sms' : 'imessage'
    };
  }

  _headers() {
    return {
      'Content-Type': 'application/json',
      'sb-api-key-id': this.apiKey,
      'sb-api-secret-key': this.apiSecret
    };
  }

  async sendTypingIndicator(to) {
    const number = normalizePhone(to);
    if (!number || !this.configured) return false;
    try {
      const res = await this.fetch(`${API_BASE}/send-typing-indicator`, {
        method: 'POST',
        headers: this._headers(),
        body: JSON.stringify({ number, ...(this.fromNumber ? { from_number: this.fromNumber } : {}) })
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  async send(to, text, mediaUrl = null, { statusCallback = null } = {}) {
    const number = normalizePhone(to);
    if (!number) throw Object.assign(new Error('Invalid recipient'), { code: 'INVALID_RECIPIENT' });
    if (!this.configured) throw Object.assign(new Error('Sendblue credentials are not configured'), { code: 'SENDBLUE_NOT_CONFIGURED' });
    const payload = { number, content: text };
    if (this.fromNumber) payload.from_number = this.fromNumber;
    if (mediaUrl) payload.media_url = mediaUrl;
    if (statusCallback) payload.status_callback = statusCallback;
    const res = await this.fetch(`${API_BASE}/send-message`, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || String(data.status || '').toUpperCase() === 'ERROR') {
      throw Object.assign(new Error(data.error_message || data.message || `Sendblue HTTP ${res.status}`), {
        code: data.error_code ? String(data.error_code) : `HTTP_${res.status}`
      });
    }
    return {
      providerMessageId: data.message_handle || null,
      status: 'sent',
      channel: data.was_downgraded ? 'sms' : 'imessage'
    };
  }
}
