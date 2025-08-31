# CSV-Based Dark Pool Scanner Setup

This guide will help you set up the manual CSV-based dark pool scanner.

## 📁 Directory Structure

Create the following directory structure in your project:

```
Website/
├── data/
│   ├── daily/          # Upload your daily CSV files here
│   └── darkpool_history.csv  # Will be created automatically
├── pages/
├── src/
└── ...
```

## 🔧 Setup Instructions

### 1. Install Dependencies

```bash
cd Website
npm install
```

### 2. Create Data Directory

   ```bash
mkdir -p data/daily
```

### 3. Upload Your CSV Files

1. **Download CSV from Polygon.io**
   - Go to your Polygon.io dashboard
   - Download the 90-day historical data as CSV
   - Make sure it includes the following columns:
     - `ticker` or `symbol`
     - `exchange`
     - `trf_id`
     - `size` or `volume`
     - `price` or `p`
     - `timestamp` or `t`

2. **Upload to the daily folder**
   - Place your CSV file in the `data/daily/` directory
   - The system will automatically use the most recent file

### 4. Start the Development Server

```bash
npm run dev
```

### 5. Access the Scanner

Navigate to `http://localhost:3000/scanner`

## 📊 CSV File Requirements

Your CSV file should have the following columns:

| Column | Required | Description |
|--------|----------|-------------|
| `ticker` or `symbol` | Yes | Stock ticker symbol |
| `exchange` | Yes | Exchange ID (4 for dark pools) |
| `trf_id` | Yes | Trade reporting facility ID |
| `size` or `volume` | Yes | Trade volume |
| `price` or `p` | Yes | Trade price |
| `timestamp` or `t` | Yes | Trade timestamp |

## 🔍 How It Works

1. **CSV Processing**: The system reads your uploaded CSV file
2. **Dark Pool Detection**: Filters trades where `exchange = 4` AND `trf_id` is present
3. **Grouping**: Groups trades by ticker and calculates totals
4. **Display**: Shows tickers sorted by dark pool volume

## 📈 Daily Workflow

1. **Download CSV**: Get your daily data from Polygon.io
2. **Upload**: Place the CSV file in `data/daily/`
3. **Refresh**: Visit the scanner page to see results
4. **Optional**: Add `?save=true` to the URL to save to historical CSV

## 🚀 Deployment

### Vercel Deployment

1. **Upload your CSV files** to the `data/daily/` directory
2. **Deploy to Vercel**:
   ```bash
   vercel --prod
   ```

### Local Deployment

1. **Build the project**:
   ```bash
   npm run build
   npm start
   ```

## 🔧 Troubleshooting

### No CSV Files Found

If you see "No CSV files found":
1. Check that your CSV file is in the `data/daily/` directory
2. Ensure the file has a `.csv` extension
3. Verify the file is readable

### No Dark Pool Trades

If no dark pool trades are found:
1. Check that your CSV has the required columns
2. Verify that `exchange = 4` for dark pool trades
3. Ensure `trf_id` is present for dark pool trades

### File Format Issues

If you get parsing errors:
1. Check that your CSV is properly formatted
2. Ensure column names match the requirements
3. Verify there are no encoding issues

## 📝 Example CSV Format

```csv
ticker,exchange,trf_id,size,price,timestamp
AAPL,4,201,100,150.25,2024-01-15T10:30:00Z
MSFT,4,202,200,300.50,2024-01-15T10:31:00Z
GOOGL,4,203,150,2800.75,2024-01-15T10:32:00Z
```

## 🎯 Benefits of This Approach

- **No API timeouts**: All processing is local
- **Fast loading**: Instant results from CSV analysis
- **Reliable**: No dependency on external API calls
- **Flexible**: Works with any CSV format from Polygon.io
- **Offline capable**: Can work without internet connection

## 📞 Support

If you encounter issues:
1. Check the browser console for error messages
2. Verify your CSV file format
3. Ensure all required columns are present
4. Check file permissions in the data directory
