# Automated SMS Alerts

Your website automatically sends SMS alerts to VolAlert Pro subscribers at **4 PM EST** on weekdays.

---

## How It Works

1. **Vercel Cron** triggers `/api/automated-scanner` at 4 PM EST (Mon-Fri)
2. The scanner reads the latest dark pool data from `data/processed/`
3. Filters for high-activity tickers (volume ratio ≥ 1.5x)
4. Sends SMS alerts to active subscribers via Twilio

---

## Required Environment Variables (Vercel Dashboard)

Go to **Vercel Dashboard → Your Project → Settings → Environment Variables** and add:

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Random secret key for security |
| `TWILIO_ACCOUNT_SID` | Your Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | Your Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | Your Twilio phone number (+1234567890) |

---

## Alert Severity Levels

| Level | Volume Ratio | Description |
|-------|-------------|-------------|
| 🔥 HOT | ≥ 3.0x | Extremely high institutional activity |
| 🌡️ WARM | 2.0x - 3.0x | Above normal activity |
| 👀 WATCH | 1.5x - 2.0x | Slightly elevated activity |

---

## Testing

### Test Locally (No SMS sent)
```bash
npm run dev
# Visit: http://localhost:3000/api/test-signals
```

### Trigger Real Alerts (Sends SMS!)
```bash
curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-site.vercel.app/api/automated-scanner
```

---

## Troubleshooting

**No alerts sending?**
- Check Twilio credentials in Vercel environment variables
- Verify subscribers have valid phone numbers
- Check Vercel function logs for errors

**No data found?**
- Ensure processed JSON files exist in `data/processed/`
- Run `node process-csv.js` to process new CSV data

**View logs:**
- Go to Vercel Dashboard → Your Project → Logs
