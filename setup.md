# 🚀 Dark Pool Scanner Setup Guide

## ✅ **What I've Built For You:**

### **1. SQL Database System**
- **SQLite database** for storing dark pool trades
- **Automatic data collection** from Polygon.io
- **15-minute refresh cycle** for real-time updates
- **Specific data fields**: ticker, exchange_id=4, trf_id, volume, price, timestamp

### **2. New Scanner Interface**
- **Shows only dark pool trades** (no more straddle signals)
- **Displays ticker, volume, and ID information**
- **"15 min delayed" indicator** instead of "Live Data"
- **Auto-refresh every 15 minutes**
- **Search functionality** for specific tickers

### **3. Database Schema**
```sql
darkpool_trades table:
- id (auto-increment)
- ticker (stock symbol)
- exchange_id (always 4 for dark pools)
- trf_id (Trade Reporting Facility ID)
- volume (number of shares)
- price (trade price)
- timestamp (trade time)
- trade_date (date)
- created_at (database timestamp)
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
- **`/api/darkpool-trades`** → Get today's dark pool trades
- **`/api/refresh-darkpool`** → Manually refresh data from Polygon

### **Auto-Refresh Schedule:**
- **Every 15 minutes** → Automatically fetches new data
- **Manual refresh** → Click refresh button anytime
- **Search refresh** → Automatically refreshes when searching specific tickers

## 🎯 **What You'll See:**

### **Scanner Dashboard:**
- **Header**: Shows "15 min delayed" badge and ticker count
- **Search**: Enter any ticker to see its dark pool trades
- **Cards**: Each card shows:
  - Ticker symbol
  - Today's dark pool volume
  - Trade ID and exchange ID
  - TRF ID and price information
  - Timestamp of trades

### **Data Updates:**
- **Real-time**: Data updates every 15 minutes automatically
- **Manual**: Click refresh button for immediate update
- **Search**: Enter ticker to see specific dark pool activity

## 🔧 **Troubleshooting:**

### **If you see "Service Temporarily Unavailable":**
1. Check your Polygon API key is set correctly
2. Verify the API key has the right permissions
3. Check Vercel environment variables

### **If no data appears:**
1. Wait 15 minutes for first data collection
2. Check browser console for errors
3. Verify Polygon API is working

### **If database issues occur:**
1. The system will automatically create the database
2. Check Vercel logs for any errors
3. Database file will be created in your project root

## 📈 **Next Steps:**

1. **Test the scanner** with popular tickers like AAPL, TSLA, NVDA
2. **Monitor the logs** to see data collection working
3. **Customize the ticker list** in `/api/refresh-darkpool.js` if needed
4. **Add more features** like historical data or alerts

The system is now ready to show you real dark pool trading activity! 🚀
