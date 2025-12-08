# 🤖 KAHF Capital - Signal Automation Guide

This guide explains how to set up automated dark pool signal alerts for your VolAlert Pro subscribers.

---

## 📊 Overview

The automation system:
1. **Processes** new CSV files from `D:\daily`
2. **Analyzes** dark pool data for unusual activity
3. **Detects** signals with severity levels (HOT 🔥, WARM 🌡️, WATCH 👀)
4. **Sends** SMS alerts to active subscribers via Twilio

---

## 🚀 Quick Start

### Option 1: Test Signals Locally (No SMS sent)

```bash
# Start the dev server
npm run dev

# Visit in browser to see detected signals
http://localhost:3000/api/test-signals
```

### Option 2: Trigger Alerts Manually

```bash
# Set your cron secret first
set CRON_SECRET=your-secret-here

# Trigger the scanner (will send SMS to real subscribers!)
curl -X POST -H "Authorization: Bearer your-secret-here" http://localhost:3000/api/automated-scanner
```

---

## 🔧 Automation Methods

Choose ONE of these methods based on your setup:

### Method 1: Vercel Cron (Production) ⭐ Recommended

Best for: Deployed website on Vercel

**Already configured in `vercel.json`:**
```json
{
  "crons": [
    {
      "path": "/api/automated-scanner",
      "schedule": "0 16 * * 1-5"
    }
  ]
}
```

**Setup Steps:**
1. Add environment variables in Vercel Dashboard:
   - `CRON_SECRET` - Your secret key
   - `TWILIO_ACCOUNT_SID` - Twilio credentials
   - `TWILIO_AUTH_TOKEN` - Twilio credentials
   - `TWILIO_PHONE_NUMBER` - Your Twilio number

2. Deploy to Vercel:
   ```bash
   vercel --prod
   ```

3. Cron will run automatically at 4 PM EST on weekdays

---

### Method 2: GitHub Actions

Best for: When you want monitoring and logs in GitHub

**Already configured in `.github/workflows/daily-signals.yml`**

**Setup Steps:**
1. Go to your GitHub repo → Settings → Secrets and variables → Actions

2. Add these secrets:
   - `WEBSITE_URL` - Your deployed website (e.g., `https://kahfcapital.com`)
   - `CRON_SECRET` - Your secret key

3. The workflow runs at 4:30 PM EST on weekdays

4. You can also trigger manually from Actions tab

---

### Method 3: Windows Task Scheduler (Local)

Best for: Running on your local Windows machine

**Setup Steps:**

1. **Set environment variable:**
   ```cmd
   setx CRON_SECRET "your-secret-here"
   ```

2. **Run the setup script as Administrator:**
   ```powershell
   # Right-click PowerShell → Run as Administrator
   cd C:\Users\kiana\OneDrive\Documents\GitHub\Website\automation
   .\setup-scheduler.ps1
   ```

3. Task will run daily at 4:30 PM

4. Check logs in: `automation\logs\`

---

## 📈 Signal Severity Levels

| Level | Volume Ratio | Emoji | Description |
|-------|-------------|-------|-------------|
| HOT   | ≥ 3.0x      | 🔥    | Extremely high institutional activity |
| WARM  | 2.0x - 3.0x | 🌡️    | Above normal activity |
| WATCH | 1.5x - 2.0x | 👀    | Slightly elevated activity |

---

## 🔐 Environment Variables Required

Create a `.env.local` file with:

```env
# Twilio SMS
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Security
CRON_SECRET=your-random-secret-key

# Optional
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

---

## 🧪 Testing

### Test Signal Detection (No SMS)
```
GET http://localhost:3000/api/test-signals
GET http://localhost:3000/api/test-signals?minValue=500000000&minPrice=100
```

### Test Full Alert Flow (Sends SMS!)
```bash
curl -X POST \
  -H "Authorization: Bearer your-secret" \
  -H "Content-Type: application/json" \
  http://localhost:3000/api/automated-scanner
```

---

## 📁 File Structure

```
Website/
├── automation/
│   ├── run-daily-signals.bat    # Windows batch script
│   ├── setup-scheduler.ps1      # Task Scheduler setup
│   └── logs/                    # Automation logs
├── lib/
│   ├── signal-detector.js       # Signal detection logic
│   ├── twilio-service.js        # SMS sending
│   └── subscribers-store.js     # Subscriber management
├── pages/api/
│   ├── automated-scanner.js     # Main automation endpoint
│   └── test-signals.js          # Testing endpoint
└── .github/workflows/
    └── daily-signals.yml        # GitHub Actions workflow
```

---

## 🔄 Daily Workflow

1. **CSV files** are added to `D:\daily` (from your data source)
2. **Process CSVs** (manual or automated):
   ```bash
   node process-csv.js
   ```
3. **Signals detected** at 4 PM EST (or manually)
4. **SMS sent** to active VolAlert Pro subscribers

---

## ⚠️ Troubleshooting

### No signals being detected
- Check that processed JSON files exist in `data/processed/`
- Verify filter settings (minValue, minPrice)
- Run `node process-csv.js` to process new data

### SMS not sending
- Verify Twilio credentials in `.env.local`
- Check subscriber phone numbers are valid
- Look for errors in console/logs

### Automation not running
- **Vercel:** Check Vercel Dashboard → Functions → Logs
- **GitHub Actions:** Check Actions tab for workflow runs
- **Windows:** Check Task Scheduler event viewer

---

## 📞 SMS Alert Format

Subscribers receive alerts like:

```
🔥 HOT NVDA
Volume: 3.2x avg
Value: $33.5B
Dark pool volume significantly above average
Check scanner for details.
```

---

## 🎯 Next Steps

1. [ ] Set up environment variables
2. [ ] Choose automation method (Vercel/GitHub/Windows)
3. [ ] Test with `/api/test-signals`
4. [ ] Deploy and monitor

---

Need help? Check the logs or test endpoints first!

