import { useState, useEffect } from 'react';

export default function TestDarkPool() {
  const [testResults, setTestResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const testDarkPoolDetection = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Test trades endpoint
      const tradesResponse = await fetch('/api/trades?symbol=AAPL&limit=100');
      const tradesData = await tradesResponse.json();
      
      // Test analytics endpoint
      const analyticsResponse = await fetch('/api/analytics/AAPL');
      const analyticsData = await analyticsResponse.json();
      
      // Test opportunities endpoint
      const opportunitiesResponse = await fetch('/api/opportunities?limit=5');
      const opportunitiesData = await opportunitiesResponse.json();
      
      setTestResults({
        trades: tradesData,
        analytics: analyticsData,
        opportunities: opportunitiesData,
        timestamp: new Date().toISOString()
      });
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          Dark Pool Detection Test
        </h1>
        
        <div className="mb-8">
          <button
            onClick={testDarkPoolDetection}
            disabled={loading}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Dark Pool Detection'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {testResults && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Trades Test Results</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(testResults.trades, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Analytics Test Results</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(testResults.analytics, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Opportunities Test Results</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(testResults.opportunities, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Test Summary</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded">
                  <h3 className="font-semibold text-blue-900">Trades API</h3>
                  <p className="text-blue-700">
                    {testResults.trades.error ? '❌ Error' : '✅ Working'}
                  </p>
                  {testResults.trades.dark_pool_metrics && (
                    <p className="text-sm text-blue-600">
                      Dark Pool Trades: {testResults.trades.dark_pool_metrics.count}
                    </p>
                  )}
                </div>
                
                <div className="bg-green-50 p-4 rounded">
                  <h3 className="font-semibold text-green-900">Analytics API</h3>
                  <p className="text-green-700">
                    {testResults.analytics.error ? '❌ Error' : '✅ Working'}
                  </p>
                  {testResults.analytics.current_activity && (
                    <p className="text-sm text-green-600">
                      Activity Ratio: {testResults.analytics.current_activity.activity_ratio.toFixed(2)}
                    </p>
                  )}
                </div>
                
                <div className="bg-purple-50 p-4 rounded">
                  <h3 className="font-semibold text-purple-900">Opportunities API</h3>
                  <p className="text-purple-700">
                    {testResults.opportunities.error ? '❌ Error' : '✅ Working'}
                  </p>
                  <p className="text-sm text-purple-600">
                    Found: {testResults.opportunities.length} opportunities
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
