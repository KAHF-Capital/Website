from sqlalchemy import create_engine, Column, Integer, String, Float, DateTime, Boolean, Text, Index
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import json

Base = declarative_base()

class DarkPoolTrade(Base):
    __tablename__ = "dark_pool_trades"
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(10), nullable=False)
    trade_id = Column(String(50), nullable=False)
    price = Column(Float, nullable=False)
    size = Column(Integer, nullable=False)
    exchange = Column(Integer, nullable=False)
    trf_id = Column(Integer)
    trf_timestamp = Column(DateTime)
    sip_timestamp = Column(DateTime, nullable=False)
    participant_timestamp = Column(DateTime, nullable=False)
    conditions = Column(Text)  # JSON array of condition codes
    tape = Column(Integer)
    sequence_number = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    __table_args__ = (
        Index('idx_symbol_timestamp', 'symbol', 'sip_timestamp'),
        Index('idx_dark_pool_exchange', 'exchange'),
    )

class StockPosition(Base):
    __tablename__ = "stock_positions"
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(10), nullable=False, unique=True)
    total_dark_pool_volume = Column(Float, default=0)
    total_dark_pool_trades = Column(Integer, default=0)
    avg_dark_pool_price = Column(Float, default=0)
    last_updated = Column(DateTime, default=datetime.utcnow)
    
    # Historical data for 90-day comparison
    historical_90d_volume = Column(Float, default=0)
    historical_90d_trades = Column(Integer, default=0)
    historical_90d_avg_price = Column(Float, default=0)
    
    # Volatility data
    implied_volatility = Column(Float, default=0)
    historical_volatility = Column(Float, default=0)
    volatility_spread = Column(Float, default=0)
    
    # Activity metrics
    activity_ratio = Column(Float, default=0)  # Current vs historical activity
    is_opportunity = Column(Boolean, default=False)
    opportunity_score = Column(Float, default=0)
    
    __table_args__ = (
        Index('idx_symbol', 'symbol'),
        Index('idx_opportunity', 'is_opportunity', 'opportunity_score'),
    )

class TradingOpportunity(Base):
    __tablename__ = "trading_opportunities"
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(10), nullable=False)
    strategy_type = Column(String(50), nullable=False)  # e.g., "Long Straddle"
    vol_spread = Column(Float, nullable=False)
    implied_vol = Column(Float, nullable=False)
    realized_vol = Column(Float, nullable=False)
    expected_profit = Column(Float, nullable=False)
    confidence = Column(Float, nullable=False)  # 0-100
    risk_level = Column(String(20), nullable=False)  # low, medium, high
    dark_pool_activity_ratio = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    is_active = Column(Boolean, default=True)
    
    # Additional metadata
    metadata = Column(Text)  # JSON object for additional data
    
    __table_args__ = (
        Index('idx_symbol_active', 'symbol', 'is_active'),
        Index('idx_created_at', 'created_at'),
        Index('idx_confidence', 'confidence'),
    )

class MarketData(Base):
    __tablename__ = "market_data"
    
    id = Column(Integer, primary_key=True)
    symbol = Column(String(10), nullable=False)
    timestamp = Column(DateTime, nullable=False)
    open_price = Column(Float)
    high_price = Column(Float)
    low_price = Column(Float)
    close_price = Column(Float)
    volume = Column(Integer)
    vwap = Column(Float)
    trades_count = Column(Integer)
    data_type = Column(String(20), default='daily')  # daily, intraday, etc.
    
    __table_args__ = (
        Index('idx_symbol_timestamp', 'symbol', 'timestamp'),
        Index('idx_data_type', 'data_type'),
    )

# Database setup
def create_database_engine(database_url):
    return create_engine(database_url)

def create_tables(engine):
    Base.metadata.create_all(engine)

def get_session(engine):
    Session = sessionmaker(bind=engine)
    return Session()
