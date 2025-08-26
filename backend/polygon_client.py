import asyncio
import aiohttp
import websockets
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Callable
from config import Config

logger = logging.getLogger(__name__)

class PolygonClient:
    def __init__(self, api_key: str):
        self.api_key = api_key
        self.rest_base_url = Config.REST_API_URL
        self.websocket_url = Config.WEBSOCKET_URL
        self.session = None
        self.websocket = None
        self.is_connected = False
        self.subscribers = []
        
    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
        if self.websocket:
            await self.websocket.close()
    
    async def get_historical_trades(self, symbol: str, date: str, limit: int = 50000) -> List[Dict]:
        """Get historical trades for a symbol on a specific date"""
        url = f"{self.rest_base_url}/v3/trades/{symbol}"
        params = {
            'apiKey': self.api_key,
            'timestamp': date,
            'limit': limit,
            'order': 'asc'
        }
        
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('results', [])
                else:
                    logger.error(f"Failed to get historical trades: {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Error fetching historical trades: {e}")
            return []
    
    async def get_ticker_details(self, symbol: str) -> Optional[Dict]:
        """Get ticker details for a symbol"""
        url = f"{self.rest_base_url}/v3/reference/tickers/{symbol}"
        params = {'apiKey': self.api_key}
        
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    logger.error(f"Failed to get ticker details: {response.status}")
                    return None
        except Exception as e:
            logger.error(f"Error fetching ticker details: {e}")
            return None
    
    async def get_aggregates(self, symbol: str, multiplier: int, timespan: str, 
                           from_date: str, to_date: str) -> List[Dict]:
        """Get aggregated data for a symbol"""
        url = f"{self.rest_base_url}/v2/aggs/ticker/{symbol}/range/{multiplier}/{timespan}/{from_date}/{to_date}"
        params = {'apiKey': self.api_key}
        
        try:
            async with self.session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return data.get('results', [])
                else:
                    logger.error(f"Failed to get aggregates: {response.status}")
                    return []
        except Exception as e:
            logger.error(f"Error fetching aggregates: {e}")
            return []
    
    async def connect_websocket(self):
        """Connect to Polygon.io WebSocket"""
        try:
            self.websocket = await websockets.connect(self.websocket_url)
            self.is_connected = True
            logger.info("Connected to Polygon.io WebSocket")
            
            # Send authentication
            auth_message = {
                "action": "auth",
                "params": self.api_key
            }
            await self.websocket.send(json.dumps(auth_message))
            
        except Exception as e:
            logger.error(f"Failed to connect to WebSocket: {e}")
            self.is_connected = False
    
    async def subscribe_to_trades(self, symbols: List[str]):
        """Subscribe to trade data for specific symbols"""
        if not self.is_connected:
            await self.connect_websocket()
        
        subscribe_message = {
            "action": "subscribe",
            "params": f"T.{','.join(symbols)}"
        }
        
        try:
            await self.websocket.send(json.dumps(subscribe_message))
            logger.info(f"Subscribed to trades for: {symbols}")
        except Exception as e:
            logger.error(f"Failed to subscribe to trades: {e}")
    
    async def listen_for_trades(self, callback: Callable):
        """Listen for incoming trade data"""
        if not self.is_connected:
            await self.connect_websocket()
        
        try:
            async for message in self.websocket:
                data = json.loads(message)
                
                # Handle different message types
                if data.get('ev') == 'T':  # Trade event
                    await callback(data)
                elif data.get('ev') == 'status':
                    logger.info(f"WebSocket status: {data}")
                elif data.get('ev') == 'error':
                    logger.error(f"WebSocket error: {data}")
                    
        except websockets.exceptions.ConnectionClosed:
            logger.warning("WebSocket connection closed, attempting to reconnect...")
            self.is_connected = False
            await asyncio.sleep(Config.WEBSOCKET_RECONNECT_DELAY)
            await self.connect_websocket()
        except Exception as e:
            logger.error(f"Error in WebSocket listener: {e}")
    
    def is_dark_pool_trade(self, trade_data: Dict) -> bool:
        """Check if a trade is from a dark pool"""
        # Dark pool trades have exchange ID of 4 and a trf_id
        return (trade_data.get('x') == Config.DARK_POOL_EXCHANGE_ID and 
                trade_data.get('trfi') is not None)
    
    async def get_dark_pool_trades(self, symbol: str, date: str) -> List[Dict]:
        """Get dark pool trades for a symbol on a specific date"""
        trades = await self.get_historical_trades(symbol, date)
        dark_pool_trades = []
        
        for trade in trades:
            if self.is_dark_pool_trade(trade):
                dark_pool_trades.append(trade)
        
        return dark_pool_trades
    
    async def calculate_volatility(self, symbol: str, days: int = 30) -> Dict:
        """Calculate historical volatility for a symbol"""
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        
        aggregates = await self.get_aggregates(
            symbol, 1, 'day',
            start_date.strftime('%Y-%m-%d'),
            end_date.strftime('%Y-%m-%d')
        )
        
        if not aggregates:
            return {'historical_vol': 0, 'implied_vol': 0}
        
        # Calculate historical volatility from daily returns
        prices = [agg['c'] for agg in aggregates if agg['c'] > 0]
        if len(prices) < 2:
            return {'historical_vol': 0, 'implied_vol': 0}
        
        returns = []
        for i in range(1, len(prices)):
            returns.append((prices[i] - prices[i-1]) / prices[i-1])
        
        # Calculate standard deviation of returns
        import numpy as np
        historical_vol = np.std(returns) * np.sqrt(252)  # Annualized
        
        # For now, we'll use a placeholder for implied volatility
        # In a real implementation, you'd get this from options data
        implied_vol = historical_vol * 1.1  # Placeholder
        
        return {
            'historical_vol': historical_vol,
            'implied_vol': implied_vol,
            'vol_spread': implied_vol - historical_vol
        }
