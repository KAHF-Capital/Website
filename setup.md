# 🚀 Dark Pool Scanner Setup Guide

## ✅ **What I've Built For You:**

### **1. JSON-Based Storage System**
- **JSON file storage** for dark pool trades (Vercel-compatible)
- **Automatic data collection** from Polygon.io
- **15-minute refresh cycle** for real-time updates
- **Specific data fields**: ticker, exchange_id=4, trf_id, volume, price, timestamp

### **2. New Scanner Interface**
- **Shows top 25 tickers by default** (ranked by dark pool volume)
- **Displays ticker and total daily volume** (no timestamps or IDs)
- **"15 min delayed" indicator** instead of "Live Data"
- **24-hour data collection** with manual refresh capability
- **90-day historical comparison** for each ticker
- **CSV download** functionality for data export
- **Daily volume resets at midnight**

### **3. Data Structure**
```json
{
  "trades": [
    {
      "id": "unique_id",
      "ticker": "AAPL",
      "exchange_id": 4,
      "trf_id": "123",
      "volume": 1000,
      "price": 150.25,
      "timestamp": "2024-01-01T10:00:00Z",
      "trade_date": "2024-01-01",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ],
  "last_updated": "2024-01-01T10:00:00Z"
}
```

## 🛠️ **What You Need to Do:**

### **Step 1: Install Dependencies**
```bash
cd Website
npm install
```

### **Step 2: Set Up Environment Variables**
1. **Copy the environment file:**
   ```bash
   cp env.example .env.local
   ```

2. **Edit `.env.local` and add your Polygon API key:**
   ```
   POLYGON_API_KEY=your_actual_polygon_api_key_here
   ```

### **Step 3: Test Locally**
```bash
npm run dev
```

Visit `http://localhost:3000/scanner` to see your dark pool scanner!

### **Step 4: Deploy to Vercel**
1. **Push your changes to GitHub**
2. **Vercel will automatically deploy** (if connected)
3. **Add environment variable in Vercel dashboard:**
   - Go to your Vercel project
   - Settings → Environment Variables
   - Add `POLYGON_API_KEY` with your actual API key

## 📊 **How It Works:**

### **Data Flow:**
1. **Polygon.io API** → Fetches trade data every 15 minutes
2. **Filtering** → Only keeps trades with `exchange_id = 4` AND `trf_id` present
3. **Database Storage** → Saves filtered dark pool trades to SQLite
4. **Frontend Display** → Shows trades in real-time with auto-refresh

### **API Endpoints:**
- **`/api/darkpool-trades`** → Get today's top 25 dark pool trades
- **`/api/refresh-darkpool`** → Manually refresh data from Polygon

### **Refresh Schedule:**
- **Manual refresh** → Click refresh button anytime to get latest data
- **90-day historical data** → Fetched for each ticker to show activity ratios
- **Timeout protection** → 15-20 second timeout per API call for large data requests
- **Midnight reset** → All data resets daily at midnight

## 🎯 **What You'll See:**

### **Scanner Dashboard:**
- **Header**: Shows "15 min delayed" badge and ticker count
- **Default View**: Shows top 25 tickers by dark pool volume for the day
- **90-Day History**: Expandable panels showing historical comparison
- **CSV Download**: Export current data to CSV file
- **Cards**: Each card shows:
  - Ticker symbol
  - Today's total dark pool volume
  - Number of trades
  - 90-day average volume and trade count
  - Volume ratio (today vs 90-day average)
  - Resets at midnight each day

### **Data Updates:**
- **Manual**: Click refresh button anytime to get latest data
- **Historical**: 90-day data fetched for activity ratio calculations
- **Export**: Download CSV file with current data and historical averages
- **Midnight reset**: All data resets daily at midnight

## 🔧 **Troubleshooting:**

### **If you see "Service Temporarily Unavailable":**
1. Check your Polygon API key is set correctly
2. Verify the API key has the right permissions
3. Check Vercel environment variables

### **If no data appears:**
1. Wait 15 minutes for first data collection
2. Check browser console for errors
3. Verify Polygon API is working

### **If storage issues occur:**
1. The system will automatically create the JSON data file
2. Check Vercel logs for any errors
3. Data file will be created in `/tmp` directory on Vercel

## 📈 **Next Steps:**

1. **Test the scanner** with popular tickers like AAPL, TSLA, NVDA
2. **Monitor the logs** to see data collection working
3. **Customize the ticker list** in `/api/refresh-darkpool.js` if needed
4. **Add more features** like historical data or alerts

The system is now ready to show you real dark pool trading activity! 🚀
