import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    # Polygon.io API Configuration
    POLYGON_API_KEY = os.getenv("POLYGON_API_KEY")
    WEBSOCKET_URL = os.getenv("WEBSOCKET_URL", "wss://socket.polygon.io/stocks")
    REST_API_URL = os.getenv("REST_API_URL", "https://api.polygon.io")
    
    # Database Configuration
    DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./dark_pool_analytics.db")
    
    # Redis Configuration
    REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
    
    # Application Settings
    DEBUG = os.getenv("DEBUG", "True").lower() == "true"
    LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO")
    
    # Dark Pool Detection Settings
    DARK_POOL_EXCHANGE_ID = 4  # Exchange ID for dark pool trades
    ACTIVITY_THRESHOLD = 300  # 300% activity threshold
    LOOKBACK_DAYS = 90  # 90 days for historical comparison
    VOLATILITY_THRESHOLD = 0.1  # 10% volatility difference threshold
    
    # API Rate Limits
    POLYGON_RATE_LIMIT = 5  # requests per second
    WEBSOCKET_RECONNECT_DELAY = 5  # seconds
    
    # Data Storage Settings
    MAX_HISTORICAL_DAYS = 365  # Store up to 1 year of historical data
    CLEANUP_INTERVAL_HOURS = 24  # Clean up old data every 24 hours
