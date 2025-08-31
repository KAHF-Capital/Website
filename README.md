# Dark Pool Scanner

A CSV-based dark pool trading analysis tool that processes Polygon.io data files locally and displays results through a web interface.

## 🚀 Features

- **Local CSV Processing**: Process large CSV files without API timeouts
- **Memory Efficient**: Chunked processing to handle 8-10GB files
- **Smart File Tracking**: Avoids reprocessing files that haven't changed
- **Date-based Analysis**: View dark pool activity by specific dates
- **Volume-based Sorting**: Tickers sorted by dark pool volume
- **Web Interface**: Clean, responsive UI for viewing results
- **Deployment Ready**: Easy deployment to Vercel

## 🛠️ Tech Stack

- **Frontend**: Next.js, React, Tailwind CSS
- **Backend**: Node.js, CSV parsing
- **Data Processing**: csv-parser, csv-writer
- **Deployment**: Vercel
- **File Management**: Local JSON storage

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Vercel CLI (for deployment)
- Polygon.io CSV files

## 🚀 Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd Website
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create data directories**
   ```bash
   mkdir -p data/daily data/processed
   ```

4. **Add your CSV files**
   - Place your Polygon.io CSV files in `data/daily/`
   - Files should contain columns: `exchange`, `trf_id`, `ticker`, `size`, `price`, `timestamp`

## 📁 Project Structure

```
Website/
├── data/
│   ├── daily/           # Raw CSV files from Polygon.io
│   └── processed/       # Processed JSON results
├── pages/
│   ├── api/            # API routes
│   ├── scanner.jsx     # Main scanner page
│   └── processor.js    # CSV processing interface
├── process-csv.js      # Standalone CSV processor
├── deploy.sh           # Linux/Mac deployment script
├── deploy.bat          # Windows deployment script
└── README.md
```

## 📊 CSV File Requirements

Your CSV files should contain these columns:
- `exchange`: Exchange code (dark pool = '4')
- `trf_id`: Trade reporting facility ID (required for dark pool trades)
- `ticker` or `symbol`: Stock symbol
- `size` or `volume`: Trade volume
- `price` or `p`: Trade price
- `timestamp` or `t`: Trade timestamp

## 🔄 How It Works

1. **CSV Processing**: 
   - Reads CSV files from `data/daily/`
   - Identifies dark pool trades (exchange='4' with trf_id)
   - Groups by date and ticker
   - Calculates volume, trade count, averages

2. **Data Storage**:
   - Saves summary JSON files
   - Creates date-specific JSON files
   - Tracks processed files to avoid reprocessing

3. **Web Display**:
   - Loads processed JSON data
   - Displays tickers sorted by volume
   - Shows detailed statistics per ticker

## 📅 Daily Workflow

### **Option 1: Manual Processing (Recommended)**

1. **Download new CSV files** from Polygon.io
2. **Place files** in `data/daily/` folder
3. **Process files locally**:
   ```bash
   cd Website
   node process-csv.js
   ```
4. **Start web server**:
   ```bash
   npm run dev
   ```
5. **View results** at `http://localhost:3000/processor`

### **Option 2: Automated Deployment**

1. **Download new CSV files** from Polygon.io
2. **Place files** in `data/daily/` folder
3. **Run deployment script**:
   ```bash
   # Windows
   deploy.bat
   
   # Linux/Mac
   ./deploy.sh
   ```
4. **View live results** at your Vercel URL

### **Smart File Tracking**

The system automatically tracks processed files:
- **New files**: Automatically processed
- **Modified files**: Reprocessed if changed
- **Unchanged files**: Skipped to save time
- **Force reprocess**: Use `node process-csv.js --force`

## 🌐 Web Interface

### **Scanner Page** (`/scanner`)
- Shows latest processed data
- Displays top tickers by volume
- Simple, clean interface

### **Processor Page** (`/processor`)
- Process all CSV files
- View data by specific dates
- Detailed ticker information
- Processing status and results

## 📊 API Endpoints

- `GET /api/darkpool-trades` - Get latest processed data
- `POST /api/process-all-csv` - Process all CSV files
- `GET /api/darkpool-by-date?date=YYYY-MM-DD` - Get data for specific date

## 🚀 Deployment

### **Local Development**
```bash
npm run dev
```
Navigate to [http://localhost:3000/scanner](http://localhost:3000/scanner)

### **Vercel Deployment**
1. **Install Vercel CLI**:
   ```bash
   npm i -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel --prod
   ```

3. **Automatic deployments** with `deploy.sh` or `deploy.bat`

## 📈 Data Output

### **Summary JSON**
```json
{
  "source_file": "data.csv",
  "processed_at": "2024-01-01T12:00:00.000Z",
  "total_dates": 7,
  "total_tickers": 150,
  "total_trades": 2500,
  "total_volume": 15000000,
  "dates": ["2024-01-01", "2024-01-02"]
}
```

### **Date-specific JSON**
```json
{
  "date": "2024-01-01",
  "tickers": [
    {
      "ticker": "AAPL",
      "total_volume": 500000,
      "trade_count": 45,
      "avg_price": 150.25,
      "total_value": 75125000,
      "min_price": 149.50,
      "max_price": 151.00
    }
  ]
}
```

## 🔧 Troubleshooting

### **Memory Issues**
- Use `node --max-old-space-size=4096 process-csv.js`
- Reduce chunk size in `process-csv.js` (CHUNK_SIZE variable)

### **File Processing Errors**
- Check CSV format matches requirements
- Ensure files are in `data/daily/` directory
- Use `node process-csv.js --force` to reprocess

### **Web Server Issues**
- Ensure you're in the `Website` directory
- Run `npm install` if dependencies are missing
- Check for port conflicts (default: 3000)

## 📝 Recent Updates

- **v2.0**: Complete CSV-based system with file tracking
- **v1.5**: Memory-efficient chunked processing
- **v1.0**: Initial Polygon.io API integration

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

