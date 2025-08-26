import React from 'react';
import { BarChart3, PieChart, TrendingUp, Target } from 'lucide-react';

export default function Analytics() {
  return (
    <div className="min-h-screen bg-white">
      <div className="p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2">Portfolio Analytics</h1>
            <p className="text-gray-600 text-lg">Comprehensive insights into your investment performance</p>
          </div>

          {/* Analytics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Total Return</p>
                  <p className="text-2xl font-bold text-green-600">+12.5%</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Volatility</p>
                  <p className="text-2xl font-bold text-gray-900">8.2%</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Sharpe Ratio</p>
                  <p className="text-2xl font-bold text-gray-900">1.45</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Beta</p>
                  <p className="text-2xl font-bold text-gray-900">0.85</p>
                </div>
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                  <PieChart className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Charts Section */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Performance Chart */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Portfolio Performance</h2>
                <p className="text-sm text-gray-600 mt-1">6-month performance vs S&P 500</p>
              </div>
              <div className="p-6">
                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                  <div className="text-center">
                    <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                    <p className="text-gray-500">Performance chart will be displayed here</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sector Allocation */}
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900">Sector Allocation</h2>
                <p className="text-sm text-gray-600 mt-1">Portfolio breakdown by sector</p>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-blue-500 rounded"></div>
                      <span className="text-sm font-medium">Technology</span>
                    </div>
                    <span className="text-sm text-gray-600">45%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-green-500 rounded"></div>
                      <span className="text-sm font-medium">Healthcare</span>
                    </div>
                    <span className="text-sm text-gray-600">25%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-purple-500 rounded"></div>
                      <span className="text-sm font-medium">Financial</span>
                    </div>
                    <span className="text-sm text-gray-600">20%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-orange-500 rounded"></div>
                      <span className="text-sm font-medium">Consumer</span>
                    </div>
                    <span className="text-sm text-gray-600">10%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Risk Metrics */}
          <div className="mt-8 bg-white border border-gray-200 rounded-xl shadow-sm">
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Risk Metrics</h2>
              <p className="text-sm text-gray-600 mt-1">Key risk indicators for your portfolio</p>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Maximum Drawdown</h3>
                  <p className="text-2xl font-bold text-red-600">-8.5%</p>
                  <p className="text-sm text-gray-600">Peak to trough decline</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Value at Risk (95%)</h3>
                  <p className="text-2xl font-bold text-gray-900">$2,450</p>
                  <p className="text-sm text-gray-600">Daily potential loss</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">Correlation</h3>
                  <p className="text-2xl font-bold text-gray-900">0.72</p>
                  <p className="text-sm text-gray-600">vs S&P 500</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
