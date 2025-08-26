# Dark Pool Analytics Backend

A comprehensive backend service for analyzing dark pool activity and generating trading opportunities using Polygon.io data.

## Features

- **Real-time Dark Pool Detection**: Identifies dark pool trades using Polygon.io's trade data
- **Historical Analysis**: Compares current activity to 90-day historical data
- **Volatility Analysis**: Calculates implied vs historical volatility spreads
- **Trading Opportunities**: Generates straddle recommendations when conditions are met
- **WebSocket Support**: Real-time data streaming
- **REST API**: Comprehensive API for data access

## Architecture

The system identifies dark pool activity by detecting trades with:
- Exchange ID of 4 (dark pool identifier)
- Presence of `trf_id` field (Trade Reporting Facility ID)

### Trading Opportunity Criteria

A trading opportunity is generated when:
1. **300% Activity Threshold**: Current dark pool activity is 300% higher than 90-day average
2. **Volatility Mismatch**: Implied volatility is lower than historical volatility
3. **Significant Spread**: Volatility spread exceeds threshold (10%)

## Setup

### Prerequisites

- Python 3.8+
- PostgreSQL (or SQLite for development)
- Redis (optional, for caching)
- Polygon.io API key

### Installation

1. **Clone the repository**
   ```bash
   cd Website/backend
   ```

2. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   cp env_example.txt .env
   # Edit .env with your configuration
   ```

4. **Set up database**
   ```bash
   # The database will be created automatically on first run
   ```

### Environment Variables

Copy `env_example.txt` to `.env` and configure:

```env
# Polygon.io API Configuration
POLYGON_API_KEY=your_polygon_api_key_here

# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/dark_pool_analytics

# Redis Configuration (for caching and Celery)
REDIS_URL=redis://localhost:6379

# Application Settings
DEBUG=True
LOG_LEVEL=INFO

# WebSocket Configuration
WEBSOCKET_URL=wss://socket.polygon.io/stocks
REST_API_URL=https://api.polygon.io
```

## Usage

### Starting the Server

```bash
python api.py
```

Or using uvicorn directly:

```bash
uvicorn api:app --host 0.0.0.0 --port 8000 --reload
```

### API Endpoints

#### Initialize API
```http
POST /api/initialize
Content-Type: application/json

{
  "api_key": "your_polygon_api_key"
}
```

#### Get Trading Opportunities
```http
GET /api/opportunities?limit=50
```

#### Get Stock Analytics
```http
GET /api/analytics/AAPL
```

#### Subscribe to Symbol
```http
POST /api/subscribe/AAPL
```

#### Health Check
```http
GET /api/health
```

#### Configuration
```http
GET /api/config
```

### WebSocket Endpoint

Connect to real-time trade data:

```javascript
const ws = new WebSocket('ws://localhost:8000/ws/trades');
ws.onmessage = (event) => {
  const tradeData = JSON.parse(event.data);
  console.log('New trade:', tradeData);
};
```

## Database Schema

### DarkPoolTrade
Stores individual dark pool trades with full metadata.

### StockPosition
Tracks aggregated dark pool activity per stock with historical comparisons.

### TradingOpportunity
Records generated trading opportunities with strategy recommendations.

### MarketData
Stores market data for volatility calculations.

## Configuration

Key configuration parameters in `config.py`:

- `DARK_POOL_EXCHANGE_ID = 4`: Exchange ID for dark pool trades
- `ACTIVITY_THRESHOLD = 300`: 300% activity threshold
- `LOOKBACK_DAYS = 90`: Days for historical comparison
- `VOLATILITY_THRESHOLD = 0.1`: 10% volatility difference threshold

## Development

### Running Tests

```bash
# Add test files and run
python -m pytest tests/
```

### Database Migrations

The system uses SQLAlchemy with automatic table creation. For production, consider using Alembic for migrations.

### Logging

Configure logging level in environment:
- `DEBUG`: Detailed debug information
- `INFO`: General information
- `WARNING`: Warning messages
- `ERROR`: Error messages only

## Production Deployment

### Docker

```dockerfile
FROM python:3.9-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Environment Considerations

1. **Database**: Use PostgreSQL for production
2. **Caching**: Implement Redis for performance
3. **Security**: Configure CORS properly
4. **Monitoring**: Add health checks and metrics
5. **Rate Limiting**: Implement API rate limiting

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Troubleshooting

### Common Issues

1. **API Key Not Set**: Ensure `POLYGON_API_KEY` is configured
2. **Database Connection**: Check `DATABASE_URL` format
3. **WebSocket Connection**: Verify Polygon.io WebSocket access
4. **Rate Limiting**: Monitor Polygon.io API limits

### Logs

Check application logs for detailed error information:

```bash
tail -f logs/app.log
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

## License

This project is licensed under the MIT License.
