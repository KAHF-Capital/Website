# Daily Workflow - Quick Reference

## 🚀 **Your Daily Routine (2 minutes)**

### **Step 1: Start Server**
```bash
cd Website
npm run dev
```

### **Step 2: View Results**
Visit: `http://localhost:3000/scanner`

### **Step 3: Browse Data**
- Select dates from the dropdown
- View dark pool activity for each day
- Tickers are sorted by volume

---

## 📊 **What You See**

### **Date Selector:**
- Dropdown with all available dates
- Automatically loads most recent date
- Easy navigation between trading days

### **Data Display:**
- Tickers sorted by dark pool volume
- Trade count per ticker
- Average price and total value
- Clean, card-based layout

---

## 🔄 **Data Preparation (One-time)**

### **Process CSV Files:**
```bash
cd Website
node process-csv.js
```

*This creates the JSON files that the web interface displays*

---

## 🎯 **File Structure**
```
data/
├── daily/           # Your CSV files (for processing)
└── processed/       # JSON results (for viewing)
    ├── 2024-01-01_filename.json
    ├── 2024-01-02_filename.json
    └── filename_summary.json
```

---

## ⚡ **Quick Commands**

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start local server |
| `node process-csv.js` | Process new CSV files |
| `node process-csv.js --force` | Reprocess all files |

---

## 🔧 **Troubleshooting**

### **No Data Showing:**
- Run `node process-csv.js` first
- Check `data/processed/` folder has JSON files
- Verify file naming: `YYYY-MM-DD_filename.json`

### **Server Issues:**
- Make sure you're in `Website` directory
- Run `npm install` if needed
- Check port 3000 isn't in use

---

## 📈 **Data Example**

```json
{
  "ticker": "AAPL",
  "total_volume": 500000,
  "trade_count": 45,
  "avg_price": 150.25,
  "total_value": 75125000
}
```

---

## 🎉 **That's It!**

Your workflow is now:
1. **Start server** → 2. **Select date** → 3. **View data**

No processing, no waiting, just instant data viewing! 🚀
