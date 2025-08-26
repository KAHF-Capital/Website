import React, { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, DollarSign, PieChart } from "lucide-react";

export default function Portfolio() {
  const [stocks, setStocks] = useState([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState({
    totalValue: 0,
    totalCost: 0,
    totalGainLoss: 0,
    gainLossPercent: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadPortfolio();
  }, []);

  const loadPortfolio = async () => {
    setIsLoading(true);
    try {
      // Mock data for demonstration
      const mockStocks = [
        {
          id: 1,
          symbol: 'AAPL',
          shares: 10,
          purchase_price: 150,
          current_price: 175,
          company_name: 'Apple Inc.',
          sector: 'Technology'
        },
        {
          id: 2,
          symbol: 'TSLA',
          shares: 5,
          purchase_price: 200,
          current_price: 220,
          company_name: 'Tesla Inc.',
          sector: 'Automotive'
        },
        {
          id: 3,
          symbol: 'MSFT',
          shares: 8,
          purchase_price: 300,
          current_price: 325,
          company_name: 'Microsoft Corporation',
          sector: 'Technology'
        }
      ];
      
      setStocks(mockStocks);
      calculateMetrics(mockStocks);
    } catch (error) {
      console.error("Error loading portfolio:", error);
      setStocks([]);
      calculateMetrics([]);
    }
    setIsLoading(false);
  };

  const calculateMetrics = (stocksData) => {
    let totalValue = 0;
    let totalCost = 0;

    stocksData.forEach(stock => {
      const currentValue = (stock.current_price || stock.purchase_price || 0) * stock.shares;
      const costBasis = (stock.purchase_price || 0) * stock.shares;
      
      totalValue += currentValue;
      totalCost += costBasis;
    });

    const totalGainLoss = totalValue - totalCost;
    const gainLossPercent = totalCost > 0 ? (totalGainLoss / totalCost) * 100 : 0;

    setPortfolioMetrics({
      totalValue,
      totalCost,
      totalGainLoss,
      gainLossPercent
    });
  };

  if (isLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {Array(4).fill(0).map((_, i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-xl animate-pulse"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Portfolio Overview</h1>
              <p className="text-gray-600 text-lg">Track your investments and performance</p>
            </div>
            <div className="flex gap-3">
              <button className="bg-green-600 hover:bg-green-700 text-white gap-2 px-4 py-2 rounded-lg font-medium">
                <PieChart className="w-4 h-4" />
                View Analytics
              </button>
              <button className="bg-green-600 hover:bg-green-700 text-white gap-2 px-4 py-2 rounded-lg font-medium">
                <TrendingUp className="w-4 h-4" />
                Add Stock
              </button>
            </div>
          </div>

          {/* Portfolio Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">${portfolioMetrics.totalValue.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Cost</p>
                  <p className="text-2xl font-bold text-gray-900">${portfolioMetrics.totalCost.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Gain/Loss</p>
                  <p className={`text-2xl font-bold ${portfolioMetrics.totalGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ${portfolioMetrics.totalGainLoss.toLocaleString()}
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${portfolioMetrics.totalGainLoss >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  {portfolioMetrics.totalGainLoss >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Gain/Loss %</p>
                  <p className={`text-2xl font-bold ${portfolioMetrics.gainLossPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {portfolioMetrics.gainLossPercent.toFixed(2)}%
                  </p>
                </div>
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${portfolioMetrics.gainLossPercent >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  {portfolioMetrics.gainLossPercent >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Stocks List */}
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Your Stocks ({stocks.length})</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Purchase Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Current Price</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Total Value</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Gain/Loss</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stocks.map((stock) => {
                    const totalValue = stock.current_price * stock.shares;
                    const costBasis = stock.purchase_price * stock.shares;
                    const gainLoss = totalValue - costBasis;
                    const gainLossPercent = (gainLoss / costBasis) * 100;
                    
                    return (
                      <tr key={stock.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-gray-900">{stock.symbol}</div>
                            <div className="text-sm text-gray-500">{stock.company_name}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{stock.shares}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stock.purchase_price}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${stock.current_price}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${totalValue.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm font-medium ${gainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            ${gainLoss.toLocaleString()} ({gainLossPercent.toFixed(2)}%)
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
