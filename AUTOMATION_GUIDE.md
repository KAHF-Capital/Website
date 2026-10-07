# Automated Email Digest

> **Status: PAUSED.** The cron jobs were removed from `vercel.json`, so neither the daily digest nor the onboarding drip runs. To resume, add this back to `vercel.json` and redeploy:
>
> ```json
> "crons": [
>   { "path": "/api/automated-scanner", "schedule": "0 14 * * 1-5" },
>   { "path": "/api/onboarding-tick", "schedule": "0 15 * * *" }
> ]
> ```

The site emails a daily unusual dark pool digest to Pro subscribers at **10 AM ET** (14:00 UTC) on weekdays.

---

## How It Works

1. **Vercel Cron** triggers `/api/automated-scanner` at 14:00 UTC (Mon-Fri)
2. The scanner reads the latest dark pool data from Vercel Blob
3. Filters for tickers with volume ratio ≥ 3.0x (falls back to the top 10 on quiet days)
4. Emails the digest via Resend to active/trialing Pro users (Firestore) plus manual entries in `data/subscribers.json`, skipping anyone on the unsubscribe list

---

## Required Environment Variables (Vercel Dashboard)

Go to **Vercel Dashboard → Your Project → Settings → Environment Variables** and add:

| Variable | Description |
|----------|-------------|
| `CRON_SECRET` | Random secret key for security |
| `RESEND_API_KEY` | Resend API key |
| `RESEND_FROM` | Sender, e.g. `KAHF Capital <alerts@kahfcapital.com>` |
| `UNSUBSCRIBE_SECRET` | Secret used to sign unsubscribe links |

---

## Testing

### Preview the email locally
```bash
node scripts/preview-digest-email.js
# Opens/writes preview-email.html
```

### Trigger a real send (emails subscribers!)
```bash
curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-site.vercel.app/api/automated-scanner
```

### Add a manual subscriber
```bash
node add-subscriber.js you@email.com
```

---

## Troubleshooting

**No emails sending?**
- Check `RESEND_API_KEY` and that the `RESEND_FROM` domain is verified in Resend
- Check Vercel function logs for errors

**No data found?**
- Run `node process-csv.js` to process and upload new CSV data

**View logs:**
- Go to Vercel Dashboard → Your Project → Logs
