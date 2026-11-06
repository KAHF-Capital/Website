// End-to-end: inbound text -> agent (mocked LLM) -> tools -> reply through the
// mock MessagingProvider.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ScriptedLlm,
  TestClock,
  classifyResponse,
  createUser,
  flushBackgroundTasks,
  inbound,
  isClassifyCall,
  isSummaryCall,
  makeSignal,
  setup,
  textResponse,
  toolUseResponse
} from './helpers.mjs';
import { processInbound } from '../../lib/kimi/inbound.js';
import { handleAgentTurn } from '../../lib/kimi/agent.js';
import { consumeSignal } from '../../lib/kimi/alert-engine.js';
import { COL, getDelivery, listUserMessages, queryBacktests, queryEvents } from '../../lib/kimi/store.js';
import { getDb } from '../../lib/kimi/db.js';

function groundedLlm() {
  return new ScriptedLlm((req) => {
    if (isClassifyCall(req)) return classifyResponse('market_question');
    if (isSummaryCall(req)) return textResponse('Asks about $NVDA dark pool flow.');
    const last = req.messages[req.messages.length - 1];
    if (Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
      const data = JSON.parse(last.content[0].content);
      const s = data.sessions[0];
      return textResponse(`$NVDA dark pool on Nov 4: $${Math.round(s.notional_usd / 1e6)}M at $${s.avg_price} avg, ${s.volume_ratio_vs_7d}x its 7-day volume.`);
    }
    return toolUseResponse('get_recent_dark_pool_prints', { ticker: 'NVDA', user_id: 'someone_else' });
  });
}

test('a verified user gets a numbers-grounded reply within ~5s (no backtest needed)', async () => {
  const llm = groundedLlm();
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z'), llm });
  await createUser();
  const started = Date.now();
  const res = await processInbound({ adapter: provider, inbound: inbound('what did the dark pool do on $NVDA?') });
  const elapsed = Date.now() - started;
  await flushBackgroundTasks();

  assert.equal(res.status, 'replied');
  assert.ok(elapsed < 5000, `took ${elapsed}ms`);
  assert.equal(provider.sent.length, 1);
  assert.equal(provider.sent[0].to, '+14155550101');
  // Every number in the reply came from the tool result.
  assert.equal(provider.sent[0].text, '$NVDA dark pool on Nov 4: $1480M at $123.45 avg, 4.1x its 7-day volume.');
  assert.equal(provider.typing.length, 1, 'typing indicator sent');

  const tools = await getDb().query(COL.toolCalls);
  assert.equal(tools.length, 1);
  assert.equal(tools[0].tool, 'get_recent_dark_pool_prints');
  assert.equal(tools[0].user_id, 'user_a', 'tool ran as the authenticated user, not the model-supplied id');
  assert.equal(tools[0].args.user_id, undefined);

  const llmCalls = await queryEvents({ types: 'llm_call' });
  assert.ok(llmCalls.length >= 3, 'classify + two tool-loop calls');
  assert.ok(llmCalls.every((e) => e.properties.cost_usd > 0 && e.properties.tokens_in > 0));
  const [inboundMsg, reply] = await listUserMessages('user_a');
  assert.equal(inboundMsg.intent, 'market_question');
  assert.equal(reply.kind, 'reply');
  assert.ok(reply.latency_ms >= 0);
});

test('LLM failures fall back to a plain reply and are logged', async () => {
  const llm = new ScriptedLlm((req) => {
    if (isClassifyCall(req)) return classifyResponse('other');
    throw Object.assign(new Error('upstream overloaded'), { status: 529 });
  });
  const { provider } = setup({ clock: new TestClock('2026-11-05T15:00:00Z'), llm });
  await createUser();
  await processInbound({ adapter: provider, inbound: inbound('thoughts on the tape today?') });
  assert.match(provider.sent[0].text, /couldn't complete that one/);
  assert.equal((await queryEvents({ types: 'agent_fallback' })).length, 1);
  assert.equal((await queryEvents({ types: 'llm_error' })).length, 1);
});

test('replying BT to an alert acknowledges at once, then texts a top-3 comparison', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  await consumeSignal(makeSignal());
  assert.equal(provider.sent.length, 1);

  clock.advance(4 * 60000);
  const res = await processInbound({ adapter: provider, inbound: inbound('BT') });
  assert.equal(res.path, 'bt');
  assert.equal(provider.sent.length, 2);
  assert.match(provider.sent[1].text, /^Running 3 structures on \$CSX \(30-day ATM, history since 20\d\d\), ~\d+s\.$/);

  await flushBackgroundTasks();
  assert.equal(provider.sent.length, 3);
  const summary = provider.sent[2].text;
  assert.match(summary, /^\$CSX by Sharpe: 1\) .+ 2\) .+ 3\) .+ Caveat: .+ Hypothetical; past performance does not guarantee future results\. https:\/\/kimi\.test\/k\/\w+$/);

  const [job] = await queryBacktests({ userId: 'user_a' });
  assert.equal(job.source, 'alert');
  assert.equal(job.alert_id, 'CSX__2026-11-05');
  assert.equal(job.request.as_of_date, '2026-11-05', 'history is capped at the signal date');
  assert.equal(job.signal_reference.backend_signal_id, 'CSX__2026-11-05');
  const delivery = await getDelivery('CSX__2026-11-05', 'user_a');
  assert.ok(delivery.replied_at, 'reply within 1h recorded');
  assert.ok(delivery.backtest_at, 'alert -> backtest conversion recorded');
});

test('MORE explains the last alert from the backend payload only', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  await consumeSignal(makeSignal());
  await processInbound({ adapter: provider, inbound: inbound('more') });
  const text = provider.sent[1].text;
  assert.match(text, /^\$CSX, Nov 5: \$630M traded off-exchange at a \$51\.57 average, 3\.0x its 7-day dark pool volume\./);
  assert.match(text, /64% historical hit rate over 25 one-month windows/);
});

test('"mute $X" updates preferences and later alerts for X are suppressed', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock });
  await createUser();
  await processInbound({ adapter: provider, inbound: inbound('mute $csx') });
  assert.match(provider.sent[0].text, /Muted \$CSX/);
  await consumeSignal(makeSignal());
  assert.equal((await getDelivery('CSX__2026-11-05', 'user_a')).suppression_reason, 'watchlist_miss');
});

test('web chat and text share one memory', async () => {
  const seen = [];
  const llm = new ScriptedLlm((req) => {
    if (isClassifyCall(req)) return classifyResponse('other');
    if (isSummaryCall(req)) return textResponse('Likes $AAPL.');
    seen.push(req.messages);
    return textResponse('Noted.');
  });
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock, llm });
  await createUser();

  await handleAgentTurn({ userId: 'user_a', text: 'I mostly trade $AAPL around earnings', channel: 'web' });
  clock.advance(60000);
  await processInbound({ adapter: provider, inbound: inbound('what should I watch this week?') });

  const smsTurn = seen[1];
  const transcript = JSON.stringify(smsTurn);
  assert.match(transcript, /I mostly trade \$AAPL around earnings/);
  assert.match(transcript, /Noted\./);
  const thread = await listUserMessages('user_a');
  assert.deepEqual(thread.map((m) => m.channel), ['web', 'web', 'imessage', 'imessage']);
});

test('KIMI_DRY_RUN=true: the full flow runs but nothing is sent', async () => {
  const clock = new TestClock('2026-11-05T15:00:00Z');
  const { provider } = setup({ clock, dryRun: true });
  await createUser();
  await consumeSignal(makeSignal());
  await processInbound({ adapter: provider, inbound: inbound('BT') });
  await flushBackgroundTasks();
  await processInbound({ adapter: provider, inbound: inbound('STOP') });
  await processInbound({ adapter: provider, inbound: inbound('hello', { from: '+19175550000' }) });
  assert.equal(provider.sent.length, 0);
  assert.equal(provider.typing.length, 0);
  const outbound = (await getDb().query(COL.messages)).filter((m) => m.direction === 'outbound');
  assert.ok(outbound.length >= 5);
  assert.ok(outbound.every((m) => m.status === 'dry_run' && m.dry_run));
});
