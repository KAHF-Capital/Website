# Daily Workflow - Quick Reference

## 🚀 **Your Daily Routine (5 minutes)**

### **Step 1: Download & Upload**
1. Download new CSV files from Polygon.io
2. Place files in `data/daily/` folder

### **Step 2: Process Files**
```bash
cd Website
node process-csv.js
```
*This will only process new/modified files automatically*

### **Step 3: View Results**
```bash
npm run dev
```
Then visit: `http://localhost:3000/processor`

---

## 🔄 **Smart File Tracking**

The system remembers what it has processed:
- ✅ **New files**: Automatically processed
- ✅ **Modified files**: Reprocessed if changed  
- ✅ **Unchanged files**: Skipped (saves time)
- ⚠️ **Force reprocess**: `node process-csv.js --force`

---

## 🚀 **Deployment (Optional)**

### **Windows:**
```bash
deploy.bat
```

### **Linux/Mac:**
```bash
./deploy.sh
```

*This automatically processes files and deploys to Vercel*

---

## 📊 **What You Get**

### **Summary Files:**
- `data/processed/{filename}_summary.json`
- Overall statistics for each CSV file

### **Date Files:**
- `data/processed/{date}_{filename}.json`
- Detailed data for each trading date

### **Web Interface:**
- `/scanner` - Latest data overview
- `/processor` - Date-specific analysis

---

## 🎯 **File Structure**
```
data/
├── daily/           # Your CSV files here
├── processed/       # Results (auto-generated)
└── processed_files.json  # Tracking file
```

---

## ⚡ **Quick Commands**

| Command | Purpose |
|---------|---------|
| `node process-csv.js` | Process new files |
| `node process-csv.js --force` | Reprocess all files |
| `npm run dev` | Start local server |
| `deploy.bat` | Deploy to Vercel |

---

## 🔧 **Troubleshooting**

### **Memory Issues:**
```bash
node --max-old-space-size=4096 process-csv.js
```

### **File Not Processing:**
- Check CSV format matches requirements
- Ensure file is in `data/daily/` folder
- Use `--force` flag to reprocess

### **Web Server Issues:**
- Make sure you're in `Website` directory
- Run `npm install` if needed
- Check port 3000 isn't in use

---

## 📈 **Data Output Example**

```json
{
  "ticker": "AAPL",
  "total_volume": 500000,
  "trade_count": 45,
  "avg_price": 150.25,
  "total_value": 75125000,
  "min_price": 149.50,
  "max_price": 151.00
}
```

---

## 🎉 **That's It!**

Your daily workflow is now:
1. **Upload CSV** → 2. **Run processor** → 3. **View results**

No more API timeouts, no more waiting, just fast local processing! 🚀
