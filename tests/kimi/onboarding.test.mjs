import test from 'node:test';
import assert from 'node:assert/strict';
import { TestClock, setup } from './helpers.mjs';
import { confirmPhoneVerification, startPhoneVerification } from '../../lib/kimi/onboarding.js';
import { KIMI_CONFIG } from '../../lib/kimi/kimi.config.js';
import { findProfileByPhone, getProfile, listUserMessages, queryEvents } from '../../lib/kimi/store.js';

const codeFrom = (provider) => provider.sent.at(-1).text.match(/\b(\d{6})\b/)[1];

test('phone verification records consent version, text, timestamp and IP, then sends the welcome text', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  const user = { uid: 'alice', email: 'alice@test.dev' };
  const sent = await startPhoneVerification({ user, phone: '(415) 555-0123' });
  assert.equal(sent.phone_masked, '+1 ••• •••-0123');
  assert.equal(sent.dev_code, undefined, 'codes are only echoed in dry run');

  const res = await confirmPhoneVerification({ user, code: codeFrom(provider), consent: true, consentVersion: KIMI_CONFIG.consent.version, ip: '198.51.100.7', userAgent: 'test' });
  assert.equal(res.profile.sms_enabled, true);
  const profile = await getProfile('alice');
  assert.equal(profile.consent_version, KIMI_CONFIG.consent.version);
  assert.equal(profile.consent_text, KIMI_CONFIG.consent.text);
  assert.equal(profile.consent_ip, '198.51.100.7');
  assert.equal(profile.consent_at, '2026-11-05T15:00:00.000Z');
  assert.ok(profile.phone_encrypted.startsWith('v1:'), 'phone encrypted at rest');
  assert.ok(!JSON.stringify(profile).includes('5550123'), 'no plaintext phone stored');
  assert.equal((await findProfileByPhone('+14155550123')).user_id, 'alice');

  const welcome = provider.sent.at(-1).text;
  for (const required of ['Kimi by KAHF Capital', 'Message frequency varies', 'Msg & data rates may apply', 'HELP', 'STOP', KIMI_CONFIG.disclaimers.welcome]) {
    assert.ok(welcome.includes(required), `welcome text includes "${required}"`);
  }
  const otpLog = (await listUserMessages('alice')).find((m) => m.kind === 'otp');
  assert.equal(otpLog.redacted, true);
  assert.doesNotMatch(otpLog.body, /\d{6}/, 'OTP is never stored');
  assert.deepEqual((await queryEvents({ types: ['phone_verified', 'consent_given'] })).map((e) => e.type).sort(), ['consent_given', 'phone_verified']);
});

test('verification requires the consent checkbox and the current consent version', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  const user = { uid: 'bob' };
  await startPhoneVerification({ user, phone: '+14155550124' });
  const code = codeFrom(provider);
  await assert.rejects(() => confirmPhoneVerification({ user, code, consent: false, consentVersion: KIMI_CONFIG.consent.version }), /consent|box/i);
  await assert.rejects(() => confirmPhoneVerification({ user, code, consent: true, consentVersion: 'old' }), /consent terms changed/);
  assert.equal((await getProfile('bob')).sms_enabled, false);
});

test('wrong codes are limited and expired codes rejected', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  const user = { uid: 'carol' };
  await startPhoneVerification({ user, phone: '+14155550125' });
  const good = codeFrom(provider);
  for (let i = 0; i < KIMI_CONFIG.onboarding.otpMaxAttempts; i += 1) {
    await assert.rejects(() => confirmPhoneVerification({ user, code: '000000' === good ? '111111' : '000000', consent: true, consentVersion: KIMI_CONFIG.consent.version }), /isn't right/);
  }
  await assert.rejects(() => confirmPhoneVerification({ user, code: good, consent: true, consentVersion: KIMI_CONFIG.consent.version }), /Too many attempts/);

  clock.advance(61 * 60000);
  await startPhoneVerification({ user, phone: '+14155550125' });
  clock.advance(11 * 60000);
  await assert.rejects(() => confirmPhoneVerification({ user, code: codeFrom(provider), consent: true, consentVersion: KIMI_CONFIG.consent.version }), /expired/);
});

test('a number can only belong to one account, and changing numbers needs a fresh verification', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  const alice = { uid: 'alice' };
  await startPhoneVerification({ user: alice, phone: '+14155550126' });
  await confirmPhoneVerification({ user: alice, code: codeFrom(provider), consent: true, consentVersion: KIMI_CONFIG.consent.version });
  await assert.rejects(() => startPhoneVerification({ user: { uid: 'mallory' }, phone: '+14155550126' }), /another KAHF account/);

  // Alice starts switching numbers: her verified number keeps working until the new one is confirmed.
  await startPhoneVerification({ user: alice, phone: '+14155550127' });
  const mid = await getProfile('alice');
  assert.equal(mid.phone_masked, '+1 ••• •••-0126');
  assert.equal(mid.pending_phone_masked, '+1 ••• •••-0127');
  await confirmPhoneVerification({ user: alice, code: codeFrom(provider), consent: true, consentVersion: KIMI_CONFIG.consent.version });
  assert.equal((await getProfile('alice')).phone_masked, '+1 ••• •••-0127');
  assert.equal(await findProfileByPhone('+14155550126'), null, 'old number released');
});

test('OTP sends are rate limited', async () => {
  setup({ clock: new TestClock('2026-11-05T15:00:00Z') });
  const user = { uid: 'dave' };
  for (let i = 0; i < KIMI_CONFIG.onboarding.otpSendsPerHour; i += 1) await startPhoneVerification({ user, phone: '+14155550128' });
  await assert.rejects(() => startPhoneVerification({ user, phone: '+14155550128' }), /Too many codes/);
});

test('in dry run the code is shown to the developer instead of texted', async () => {
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z'), dryRun: true });
  const res = await startPhoneVerification({ user: { uid: 'erin' }, phone: '+14155550129' });
  assert.match(res.dev_code, /^\d{6}$/);
  assert.equal(provider.sent.length, 0);
});
