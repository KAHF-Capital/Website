# Dark Pool Straddle Automation System

## Overview

This automation system analyzes all tickers with high dark pool activity (>300%) and sends SMS alerts when profitable straddle opportunities (>55% profitability) are found. The system runs daily and provides real-time notifications for trading opportunities.

## Features

- **Automated Dark Pool Scanning**: Filters tickers with >300% dark pool activity
- **Straddle Profitability Analysis**: Calculates historical profitability for each ticker
- **SMS Notifications**: Sends alerts for profitable straddles via Twilio
- **Configurable Thresholds**: Customizable parameters for activity and profitability
- **Scheduled Execution**: Daily automation with cron job support
- **Comprehensive Logging**: Detailed logs for monitoring and debugging

## Quick Start

### 1. Setup Environment

```bash
# Run the automation setup wizard
node setup-automation.js
```

This will guide you through configuring:
- Dark pool activity thresholds
- Profitability thresholds
- SMS notification settings
- Scheduling preferences

### 2. Manual Testing

```bash
# Test the automation pipeline
curl -X POST http://localhost:3000/api/run-automation
```

### 3. Production Deployment

For production deployment on Vercel, add these environment variables:

```bash
# Core automation
AUTOMATION_ENABLED=true
MIN_DARK_POOL_ACTIVITY=3.0
PROFITABLE_THRESHOLD=55
MAX_TICKERS_TO_ANALYZE=50

# SMS notifications
SEND_ALERTS=true
SMS_ALERTS_ENABLED=true
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone_number
RECIPIENT_PHONE_NUMBER=your_phone_number

# Scheduling
SCHEDULE_ENABLED=true
CRON_EXPRESSION=0 9 * * 1-5
TIMEZONE=America/New_York
```

## API Endpoints

### 1. Automated Scanner (`/api/automated-scanner`)

Filters tickers with high dark pool activity.

**Response:**
```json
{
  "date": "2025-09-10",
  "high_activity_tickers": 15,
  "tickers": [
    {
      "ticker": "AAPL",
      "volume_ratio": "4.25",
      "total_volume": 50000000,
      "avg_price": 150.25,
      "total_value": 7500000000
    }
  ]
}
```

### 2. Straddle Analysis (`/api/automated-straddle-analysis`)

Analyzes straddle profitability for filtered tickers.

**Request:**
```json
{
  "tickers": [
    {
      "ticker": "AAPL",
      "avg_price": 150.25
    }
  ]
}
```

**Response:**
```json
{
  "profitable_straddles": 3,
  "profitable_straddles_list": [
    {
      "ticker": "AAPL",
      "profitableRate": 67.5,
      "currentPrice": 150.25,
      "estimatedPremium": 4.51,
      "upperBreakeven": 154.76,
      "lowerBreakeven": 145.74
    }
  ]
}
```

### 3. SMS Alerts (`/api/send-sms-alert`)

Sends SMS notifications for profitable straddles.

**Request:**
```json
{
  "profitableStraddles": [
    {
      "ticker": "AAPL",
      "profitableRate": 67.5,
      "currentPrice": 150.25
    }
  ]
}
```

### 4. Run Automation (`/api/run-automation`)

Orchestrates the entire automation pipeline.

**Response:**
```json
{
  "success": true,
  "results": {
    "summary": {
      "totalTickersAnalyzed": 11257,
      "highActivityTickers": 15,
      "profitableStraddles": 3,
      "topProfitableStraddles": [
        {
          "ticker": "AAPL",
          "profitableRate": 67.5,
          "currentPrice": 150.25
        }
      ]
    }
  }
}
```

## Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `AUTOMATION_ENABLED` | Enable/disable automation | `false` | No |
| `MIN_DARK_POOL_ACTIVITY` | Minimum dark pool activity ratio | `3.0` | No |
| `PROFITABLE_THRESHOLD` | Minimum profitability % for alerts | `55` | No |
| `MAX_TICKERS_TO_ANALYZE` | Max tickers to analyze per run | `50` | No |
| `SEND_ALERTS` | Enable/disable all alerts | `false` | No |
| `SMS_ALERTS_ENABLED` | Enable/disable SMS alerts | `false` | No |
| `TWILIO_ACCOUNT_SID` | Twilio account SID | - | Yes (for SMS) |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | - | Yes (for SMS) |
| `TWILIO_PHONE_NUMBER` | Twilio phone number | - | Yes (for SMS) |
| `RECIPIENT_PHONE_NUMBER` | Your phone number | - | Yes (for SMS) |
| `POLYGON_API_KEY` | Polygon.io API key | - | Yes |
| `ALPHA_VANTAGE_API_KEY` | Alpha Vantage API key | - | No |

### Threshold Configuration

- **Dark Pool Activity**: Minimum ratio of today's volume to 7-day average (3.0 = 300%)
- **Profitability Threshold**: Minimum historical profitability percentage (55 = 55%)
- **Price Filter**: Minimum stock price ($10+)
- **Volume Filter**: Minimum daily volume ($250M+)

## Scheduling

### Local Development

For local testing, you can use a simple cron job:

```bash
# Add to crontab (crontab -e)
0 9 * * 1-5 curl -X POST http://localhost:3000/api/run-automation
```

### Vercel Deployment

For Vercel, create a `vercel.json` file:

```json
{
  "crons": [
    {
      "path": "/api/run-automation",
      "schedule": "0 9 * * 1-5"
    }
  ]
}
```

### Other Platforms

- **Railway**: Use their cron job feature
- **Heroku**: Use Heroku Scheduler addon
- **AWS**: Use EventBridge with Lambda
- **Google Cloud**: Use Cloud Scheduler

## Monitoring and Logs

### Log Levels

- `debug`: Detailed execution information
- `info`: General execution flow
- `warn`: Warning messages
- `error`: Error messages

### Log Output

The system logs:
- Automation pipeline start/end
- Number of tickers analyzed
- Profitable straddles found
- SMS notification status
- Error details and stack traces

### Monitoring

Monitor these key metrics:
- Daily execution success rate
- Number of high activity tickers found
- Number of profitable straddles identified
- SMS delivery success rate
- API response times

## Troubleshooting

### Common Issues

1. **No tickers found with high activity**
   - Check if CSV data is processed and up-to-date
   - Verify `MIN_DARK_POOL_ACTIVITY` threshold
   - Ensure data files exist in `data/processed/`

2. **SMS notifications not working**
   - Verify Twilio credentials in environment variables
   - Check phone number format (+1234567890)
   - Ensure `SMS_ALERTS_ENABLED=true`

3. **API rate limiting**
   - Reduce `MAX_CONCURRENT_ANALYSIS` value
   - Add delays between API calls
   - Check API key limits

4. **No profitable straddles found**
   - Lower `PROFITABLE_THRESHOLD` value
   - Check historical data availability
   - Verify options data quality

### Debug Mode

Enable debug logging:

```bash
LOG_LEVEL=debug
```

### Manual Testing

Test individual components:

```bash
# Test scanner only
curl http://localhost:3000/api/automated-scanner

# Test analysis only
curl -X POST http://localhost:3000/api/automated-straddle-analysis \
  -H "Content-Type: application/json" \
  -d '{"tickers":[{"ticker":"AAPL","avg_price":150.25}]}'
```

## Security Considerations

- Store API keys in environment variables only
- Use HTTPS in production
- Implement rate limiting for API endpoints
- Monitor for unusual activity
- Regularly rotate API keys

## Performance Optimization

- Use concurrent processing for multiple tickers
- Implement caching for frequently accessed data
- Optimize database queries
- Monitor memory usage for large datasets
- Use connection pooling for external APIs

## Future Enhancements

- Email notifications as backup
- Webhook notifications for external systems
- Advanced filtering options
- Portfolio tracking integration
- Real-time price monitoring
- Machine learning for threshold optimization

## Support

For issues or questions:
1. Check the logs for error details
2. Verify environment configuration
3. Test individual API endpoints
4. Review the troubleshooting section
5. Check API key limits and quotas
