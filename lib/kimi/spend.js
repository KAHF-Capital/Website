// Global daily spend alert (LLM + messaging). Fires once per day when the
// configured threshold is crossed: logs, records an event, and optionally posts
// to a Slack-compatible webhook.

import { KIMI_CONFIG } from './kimi.config.js';
import { getUsage, getSystemState, updateSystemMeta, emitEvent } from './store.js';
import { clockNow } from './runtime.js';

export async function checkGlobalSpend(now = clockNow()) {
  const threshold = KIMI_CONFIG.agent.globalDailySpendAlertUsd;
  if (!threshold || threshold <= 0) return null;
  const usage = await getUsage('global', now);
  const total = usage.llm_cost_usd + usage.messaging_cost_usd;
  if (total < threshold) return null;
  const sys = await getSystemState();
  if (sys.spend_alert_day === usage.day) return null;
  await updateSystemMeta({ spend_alert_day: usage.day });
  const properties = { day: usage.day, total_usd: Number(total.toFixed(4)), threshold_usd: threshold };
  await emitEvent('global_spend_alert', { properties });
  console.error(`[kimi] Global spend alert: $${total.toFixed(2)} on ${usage.day} (threshold $${threshold}).`);
  const webhook = KIMI_CONFIG.agent.spendAlertWebhookUrl;
  if (webhook) {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `Kimi spend alert: $${total.toFixed(2)} today (threshold $${threshold}).` })
    }).catch((err) => console.error('[kimi] spend alert webhook failed:', err.message));
  }
  return properties;
}
