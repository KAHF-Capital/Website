import asyncio
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from models import DarkPoolTrade, StockPosition, TradingOpportunity, MarketData, get_session
from polygon_client import PolygonClient
from config import Config

logger = logging.getLogger(__name__)

class AnalyticsService:
    def __init__(self, polygon_client: PolygonClient, engine):
        self.polygon_client = polygon_client
        self.engine = engine
        
    async def process_dark_pool_trade(self, trade_data: Dict):
        """Process incoming dark pool trade data"""
        if not self.polygon_client.is_dark_pool_trade(trade_data):
            return
        
        try:
            # Convert timestamp from milliseconds to datetime
            timestamp = datetime.fromtimestamp(trade_data['t'] / 1000)
            
            # Create dark pool trade record
            dark_pool_trade = DarkPoolTrade(
                symbol=trade_data['sym'],
                trade_id=trade_data['i'],
                price=trade_data['p'],
                size=trade_data['s'],
                exchange=trade_data['x'],
                trf_id=trade_data.get('trfi'),
                trf_timestamp=datetime.fromtimestamp(trade_data.get('trft', 0) / 1000) if trade_data.get('trft') else None,
                sip_timestamp=timestamp,
                participant_timestamp=timestamp,  # Using SIP timestamp as fallback
                conditions=json.dumps(trade_data.get('c', [])),
                tape=trade_data.get('z'),
                sequence_number=trade_data.get('q')
            )
            
            # Save to database
            session = get_session(self.engine)
            try:
                session.add(dark_pool_trade)
                session.commit()
                
                # Update stock position
                await self.update_stock_position(trade_data['sym'])
                
            except Exception as e:
                session.rollback()
                logger.error(f"Error saving dark pool trade: {e}")
            finally:
                session.close()
                
        except Exception as e:
            logger.error(f"Error processing dark pool trade: {e}")
    
    async def update_stock_position(self, symbol: str):
        """Update stock position with latest dark pool activity"""
        session = get_session(self.engine)
        try:
            # Get current date
            today = datetime.now().date()
            
            # Calculate current day dark pool activity
            today_trades = session.query(DarkPoolTrade).filter(
                and_(
                    DarkPoolTrade.symbol == symbol,
                    func.date(DarkPoolTrade.sip_timestamp) == today
                )
            ).all()
            
            current_volume = sum(trade.size for trade in today_trades)
            current_trades_count = len(today_trades)
            current_avg_price = sum(trade.price * trade.size for trade in today_trades) / current_volume if current_volume > 0 else 0
            
            # Calculate historical 90-day activity
            ninety_days_ago = today - timedelta(days=Config.LOOKBACK_DAYS)
            historical_trades = session.query(DarkPoolTrade).filter(
                and_(
                    DarkPoolTrade.symbol == symbol,
                    DarkPoolTrade.sip_timestamp >= ninety_days_ago,
                    DarkPoolTrade.sip_timestamp < today
                )
            ).all()
            
            historical_volume = sum(trade.size for trade in historical_trades)
            historical_trades_count = len(historical_trades)
            historical_avg_price = sum(trade.price * trade.size for trade in historical_trades) / historical_volume if historical_volume > 0 else 0
            
            # Calculate activity ratio
            activity_ratio = (current_volume / (historical_volume / Config.LOOKBACK_DAYS)) if historical_volume > 0 else 0
            
            # Get or create stock position
            stock_position = session.query(StockPosition).filter(
                StockPosition.symbol == symbol
            ).first()
            
            if not stock_position:
                stock_position = StockPosition(symbol=symbol)
                session.add(stock_position)
            
            # Update stock position
            stock_position.total_dark_pool_volume = current_volume
            stock_position.total_dark_pool_trades = current_trades_count
            stock_position.avg_dark_pool_price = current_avg_price
            stock_position.historical_90d_volume = historical_volume
            stock_position.historical_90d_trades = historical_trades_count
            stock_position.historical_90d_avg_price = historical_avg_price
            stock_position.activity_ratio = activity_ratio
            stock_position.last_updated = datetime.utcnow()
            
            # Calculate volatility
            volatility_data = await self.polygon_client.calculate_volatility(symbol)
            stock_position.implied_volatility = volatility_data['implied_vol']
            stock_position.historical_volatility = volatility_data['historical_vol']
            stock_position.volatility_spread = volatility_data['vol_spread']
            
            # Check if this is a trading opportunity
            is_opportunity = (
                activity_ratio >= Config.ACTIVITY_THRESHOLD / 100 and  # Convert percentage to decimal
                volatility_data['implied_vol'] < volatility_data['historical_vol'] and
                abs(volatility_data['vol_spread']) > Config.VOLATILITY_THRESHOLD
            )
            
            stock_position.is_opportunity = is_opportunity
            
            if is_opportunity:
                # Calculate opportunity score
                opportunity_score = self.calculate_opportunity_score(
                    activity_ratio, volatility_data, current_volume
                )
                stock_position.opportunity_score = opportunity_score
                
                # Create trading opportunity
                await self.create_trading_opportunity(symbol, stock_position, volatility_data)
            
            session.commit()
            
        except Exception as e:
            session.rollback()
            logger.error(f"Error updating stock position: {e}")
        finally:
            session.close()
    
    def calculate_opportunity_score(self, activity_ratio: float, volatility_data: Dict, volume: float) -> float:
        """Calculate opportunity score based on various factors"""
        # Activity score (0-40 points)
        activity_score = min(40, (activity_ratio - 1) * 20)
        
        # Volatility score (0-30 points)
        vol_spread = abs(volatility_data['vol_spread'])
        volatility_score = min(30, vol_spread * 100)
        
        # Volume score (0-30 points)
        volume_score = min(30, volume / 1000000)  # Normalize by 1M shares
        
        return activity_score + volatility_score + volume_score
    
    async def create_trading_opportunity(self, symbol: str, stock_position: StockPosition, volatility_data: Dict):
        """Create a trading opportunity record"""
        session = get_session(self.engine)
        try:
            # Determine strategy type based on volatility spread
            if volatility_data['vol_spread'] > 0:
                strategy_type = "Long Straddle"
                expected_profit = 1500  # Placeholder calculation
            else:
                strategy_type = "Vol Crush Trade"
                expected_profit = 1200  # Placeholder calculation
            
            # Calculate confidence based on activity ratio and volatility
            confidence = min(95, stock_position.activity_ratio * 20 + abs(volatility_data['vol_spread']) * 50)
            
            # Determine risk level
            if stock_position.activity_ratio > 5:
                risk_level = "high"
            elif stock_position.activity_ratio > 3:
                risk_level = "medium"
            else:
                risk_level = "low"
            
            # Check if opportunity already exists
            existing_opportunity = session.query(TradingOpportunity).filter(
                and_(
                    TradingOpportunity.symbol == symbol,
                    TradingOpportunity.is_active == True
                )
            ).first()
            
            if existing_opportunity:
                # Update existing opportunity
                existing_opportunity.vol_spread = volatility_data['vol_spread']
                existing_opportunity.implied_vol = volatility_data['implied_vol']
                existing_opportunity.realized_vol = volatility_data['historical_vol']
                existing_opportunity.expected_profit = expected_profit
                existing_opportunity.confidence = confidence
                existing_opportunity.dark_pool_activity_ratio = stock_position.activity_ratio
                existing_opportunity.last_updated = datetime.utcnow()
            else:
                # Create new opportunity
                opportunity = TradingOpportunity(
                    symbol=symbol,
                    strategy_type=strategy_type,
                    vol_spread=volatility_data['vol_spread'],
                    implied_vol=volatility_data['implied_vol'],
                    realized_vol=volatility_data['historical_vol'],
                    expected_profit=expected_profit,
                    confidence=confidence,
                    risk_level=risk_level,
                    dark_pool_activity_ratio=stock_position.activity_ratio,
                    expires_at=datetime.utcnow() + timedelta(hours=24),  # Expire in 24 hours
                    metadata=json.dumps({
                        'activity_ratio': stock_position.activity_ratio,
                        'total_volume': stock_position.total_dark_pool_volume,
                        'total_trades': stock_position.total_dark_pool_trades
                    })
                )
                session.add(opportunity)
            
            session.commit()
            logger.info(f"Created/updated trading opportunity for {symbol}")
            
        except Exception as e:
            session.rollback()
            logger.error(f"Error creating trading opportunity: {e}")
        finally:
            session.close()
    
    async def get_active_opportunities(self, limit: int = 50) -> List[Dict]:
        """Get active trading opportunities"""
        session = get_session(self.engine)
        try:
            opportunities = session.query(TradingOpportunity).filter(
                and_(
                    TradingOpportunity.is_active == True,
                    TradingOpportunity.expires_at > datetime.utcnow()
                )
            ).order_by(TradingOpportunity.confidence.desc()).limit(limit).all()
            
            return [
                {
                    'id': opp.id,
                    'symbol': opp.symbol,
                    'strategy_type': opp.strategy_type,
                    'vol_spread': opp.vol_spread,
                    'implied_vol': opp.implied_vol,
                    'realized_vol': opp.realized_vol,
                    'expected_profit': opp.expected_profit,
                    'confidence': opp.confidence,
                    'risk_level': opp.risk_level,
                    'dark_pool_activity_ratio': opp.dark_pool_activity_ratio,
                    'created_at': opp.created_at.isoformat(),
                    'expires_at': opp.expires_at.isoformat() if opp.expires_at else None,
                    'metadata': json.loads(opp.metadata) if opp.metadata else {}
                }
                for opp in opportunities
            ]
            
        except Exception as e:
            logger.error(f"Error getting active opportunities: {e}")
            return []
        finally:
            session.close()
    
    async def get_stock_analytics(self, symbol: str) -> Optional[Dict]:
        """Get analytics for a specific stock"""
        session = get_session(self.engine)
        try:
            stock_position = session.query(StockPosition).filter(
                StockPosition.symbol == symbol
            ).first()
            
            if not stock_position:
                return None
            
            # Get recent dark pool trades
            recent_trades = session.query(DarkPoolTrade).filter(
                DarkPoolTrade.symbol == symbol
            ).order_by(DarkPoolTrade.sip_timestamp.desc()).limit(10).all()
            
            return {
                'symbol': stock_position.symbol,
                'current_activity': {
                    'volume': stock_position.total_dark_pool_volume,
                    'trades': stock_position.total_dark_pool_trades,
                    'avg_price': stock_position.avg_dark_pool_price,
                    'activity_ratio': stock_position.activity_ratio
                },
                'historical_activity': {
                    'volume': stock_position.historical_90d_volume,
                    'trades': stock_position.historical_90d_trades,
                    'avg_price': stock_position.historical_90d_avg_price
                },
                'volatility': {
                    'implied': stock_position.implied_volatility,
                    'historical': stock_position.historical_volatility,
                    'spread': stock_position.volatility_spread
                },
                'is_opportunity': stock_position.is_opportunity,
                'opportunity_score': stock_position.opportunity_score,
                'last_updated': stock_position.last_updated.isoformat(),
                'recent_trades': [
                    {
                        'price': trade.price,
                        'size': trade.size,
                        'timestamp': trade.sip_timestamp.isoformat(),
                        'conditions': json.loads(trade.conditions) if trade.conditions else []
                    }
                    for trade in recent_trades
                ]
            }
            
        except Exception as e:
            logger.error(f"Error getting stock analytics: {e}")
            return None
        finally:
            session.close()

# Import json for the JSON operations
import json
