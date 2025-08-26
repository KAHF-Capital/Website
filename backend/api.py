from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import logging

from config import Config
from models import create_database_engine, create_tables, get_session
from polygon_client import PolygonClient
from analytics_service import AnalyticsService

# Configure logging
logging.basicConfig(level=getattr(logging, Config.LOG_LEVEL))
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Dark Pool Analytics API",
    description="API for analyzing dark pool activity and generating trading opportunities",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure this properly for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize database and services
engine = create_database_engine(Config.DATABASE_URL)
create_tables(engine)

# Initialize Polygon client and analytics service
polygon_client = None
analytics_service = None

# Pydantic models for API requests/responses
class APIKeyRequest(BaseModel):
    api_key: str

class SymbolRequest(BaseModel):
    symbol: str

class OpportunityResponse(BaseModel):
    id: int
    symbol: str
    strategy_type: str
    vol_spread: float
    implied_vol: float
    realized_vol: float
    expected_profit: float
    confidence: float
    risk_level: str
    dark_pool_activity_ratio: float
    created_at: str
    expires_at: Optional[str]
    metadata: dict

class StockAnalyticsResponse(BaseModel):
    symbol: str
    current_activity: dict
    historical_activity: dict
    volatility: dict
    is_opportunity: bool
    opportunity_score: float
    last_updated: str
    recent_trades: List[dict]

# Background task to initialize services
async def initialize_services(api_key: str):
    global polygon_client, analytics_service
    
    try:
        polygon_client = PolygonClient(api_key)
        analytics_service = AnalyticsService(polygon_client, engine)
        logger.info("Services initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize services: {e}")

@app.on_event("startup")
async def startup_event():
    logger.info("Starting Dark Pool Analytics API")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Dark Pool Analytics API")

@app.post("/api/initialize")
async def initialize_api(api_key_request: APIKeyRequest, background_tasks: BackgroundTasks):
    """Initialize the API with Polygon.io API key"""
    try:
        background_tasks.add_task(initialize_services, api_key_request.api_key)
        return {"message": "API initialization started", "status": "initializing"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initialize API: {str(e)}")

@app.get("/api/opportunities", response_model=List[OpportunityResponse])
async def get_opportunities(limit: int = 50):
    """Get active trading opportunities"""
    if not analytics_service:
        raise HTTPException(status_code=503, detail="Analytics service not initialized")
    
    try:
        opportunities = await analytics_service.get_active_opportunities(limit)
        return opportunities
    except Exception as e:
        logger.error(f"Error getting opportunities: {e}")
        raise HTTPException(status_code=500, detail="Failed to get opportunities")

@app.get("/api/analytics/{symbol}", response_model=StockAnalyticsResponse)
async def get_stock_analytics(symbol: str):
    """Get analytics for a specific stock"""
    if not analytics_service:
        raise HTTPException(status_code=503, detail="Analytics service not initialized")
    
    try:
        analytics = await analytics_service.get_stock_analytics(symbol.upper())
        if not analytics:
            raise HTTPException(status_code=404, detail=f"No data found for symbol {symbol}")
        return analytics
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting stock analytics: {e}")
        raise HTTPException(status_code=500, detail="Failed to get stock analytics")

@app.post("/api/subscribe/{symbol}")
async def subscribe_to_symbol(symbol: str):
    """Subscribe to real-time data for a symbol"""
    if not polygon_client:
        raise HTTPException(status_code=503, detail="Polygon client not initialized")
    
    try:
        await polygon_client.subscribe_to_trades([symbol.upper()])
        return {"message": f"Subscribed to {symbol}", "symbol": symbol.upper()}
    except Exception as e:
        logger.error(f"Error subscribing to symbol: {e}")
        raise HTTPException(status_code=500, detail="Failed to subscribe to symbol")

@app.get("/api/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "polygon_client_initialized": polygon_client is not None,
        "analytics_service_initialized": analytics_service is not None
    }

@app.get("/api/config")
async def get_config():
    """Get current configuration (without sensitive data)"""
    return {
        "dark_pool_exchange_id": Config.DARK_POOL_EXCHANGE_ID,
        "activity_threshold": Config.ACTIVITY_THRESHOLD,
        "lookback_days": Config.LOOKBACK_DAYS,
        "volatility_threshold": Config.VOLATILITY_THRESHOLD,
        "websocket_url": Config.WEBSOCKET_URL,
        "rest_api_url": Config.REST_API_URL
    }

# WebSocket endpoint for real-time data
@app.websocket("/ws/trades")
async def websocket_trades(websocket):
    """WebSocket endpoint for real-time trade data"""
    if not polygon_client:
        await websocket.close(code=1008, reason="Polygon client not initialized")
        return
    
    try:
        # Start listening for trades
        async def trade_callback(trade_data):
            # Process the trade
            if analytics_service:
                await analytics_service.process_dark_pool_trade(trade_data)
            
            # Send to WebSocket client
            await websocket.send_json(trade_data)
        
        await polygon_client.listen_for_trades(trade_callback)
        
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close(code=1011, reason="Internal server error")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
