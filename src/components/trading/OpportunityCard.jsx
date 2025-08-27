import React from 'react';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { TrendingUp, TrendingDown, DollarSign, Target, AlertTriangle } from 'lucide-react';

const OpportunityCard = ({ opportunity }) => {
  const {
    symbol,
    strategy_type,
    vol_spread,
    implied_vol,
    realized_vol,
    expected_profit,
    confidence,
    risk_level
  } = opportunity;

  const getRiskColor = (risk) => {
    switch (risk) {
      case "low": return "bg-green-100 text-green-800";
      case "medium": return "bg-yellow-100 text-yellow-800";
      case "high": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getConfidenceColor = (conf) => {
    if (conf >= 90) return "text-green-600";
    if (conf >= 80) return "text-yellow-600";
    return "text-red-600";
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">{symbol}</h3>
          <p className="text-sm text-gray-600">{strategy_type}</p>
        </div>
        <Badge className={getRiskColor(risk_level)}>
          {risk_level.charAt(0).toUpperCase() + risk_level.slice(1)} Risk
        </Badge>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <DollarSign className="h-4 w-4 text-green-600 mr-1" />
            <span className="text-lg font-semibold text-gray-900">
              {formatCurrency(expected_profit)}
            </span>
          </div>
          <p className="text-xs text-gray-600">Expected Profit</p>
        </div>
        
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <Target className="h-4 w-4 text-blue-600 mr-1" />
            <span className={`text-lg font-semibold ${getConfidenceColor(confidence)}`}>
              {confidence}%
            </span>
          </div>
          <p className="text-xs text-gray-600">Confidence</p>
        </div>
      </div>

      {/* Volatility Metrics */}
      <div className="space-y-3 mb-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Volatility Spread:</span>
          <div className="flex items-center">
            {vol_spread > 0 ? (
              <TrendingUp className="h-4 w-4 text-green-600 mr-1" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600 mr-1" />
            )}
            <span className={`text-sm font-medium ${vol_spread > 0 ? 'text-green-600' : 'text-red-600'}`}>
              {vol_spread > 0 ? '+' : ''}{vol_spread.toFixed(1)}%
            </span>
          </div>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Implied Vol:</span>
          <span className="text-sm font-medium text-gray-900">{formatPercentage(implied_vol)}</span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Realized Vol:</span>
          <span className="text-sm font-medium text-gray-900">{formatPercentage(realized_vol)}</span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex space-x-2">
        <Button className="flex-1" size="sm">
          View Details
        </Button>
        <Button variant="outline" size="sm" className="flex items-center">
          <AlertTriangle className="h-4 w-4 mr-1" />
          Risk
        </Button>
      </div>
    </div>
  );
};

export default OpportunityCard;

