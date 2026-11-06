// In-memory provider for tests and local simulation. Its webhook is disabled in
// production unless KIMI_ENABLE_MOCK_PROVIDER=true.

import { normalizePhone, timingSafeEqualStr } from '../crypto.js';
import { clockNow } from '../runtime.js';

export class MockMessagingProvider {
  constructor({ channel = 'imessage', secret = null, failWith = null } = {}) {
    this.name = 'mock';
    this.channel = channel;
    this.secret = secret ?? process.env.KIMI_MOCK_WEBHOOK_SECRET ?? '';
    this.failWith = failWith;
    this.sent = [];
    this.typing = [];
    this.counter = 0;
  }

  verifySignature(req) {
    if (!this.secret) return false;
    return timingSafeEqualStr(req?.headers?.['x-kimi-mock-signature'], this.secret);
  }

  parseInbound(req) {
    const body = req?.body || {};
    return {
      providerMessageId: String(body.providerMessageId || body.id || '').trim(),
      from: normalizePhone(body.from),
      text: String(body.text ?? '').trim(),
      media: Array.isArray(body.media) ? body.media : [],
      receivedAt: body.receivedAt || clockNow().toISOString(),
      channel: body.channel || this.channel
    };
  }

  parseStatus(req) {
    const body = req?.body || {};
    return {
      providerMessageId: String(body.providerMessageId || '').trim(),
      status: body.status || 'delivered',
      errorCode: body.errorCode || null,
      errorMessage: null,
      channel: this.channel
    };
  }

  async sendTypingIndicator(to) {
    this.typing.push({ to: normalizePhone(to), at: clockNow().toISOString() });
    return true;
  }

  async send(to, text, mediaUrl = null) {
    if (this.failWith) throw Object.assign(new Error(this.failWith.message || 'mock failure'), { code: this.failWith.code || 'MOCK_FAIL' });
    this.counter += 1;
    const record = { providerMessageId: `mock_${this.counter}_${Date.now()}`, to: normalizePhone(to), text, mediaUrl, at: clockNow().toISOString() };
    this.sent.push(record);
    return { providerMessageId: record.providerMessageId, status: 'sent', channel: this.channel };
  }

  reset() {
    this.sent = [];
    this.typing = [];
  }
}
