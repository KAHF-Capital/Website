import React, { useState, useEffect } from 'react';

export default function TestAPI() {
  const [healthData, setHealthData] = useState(null);
  const [opportunitiesData, setOpportunitiesData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    testAPIs();
  }, []);

  const testAPIs = async () => {
    try {
      setLoading(true);
      setError(null);

      // Test health endpoint
      console.log('Testing health endpoint...');
      const healthResponse = await fetch('/api/health');
      const healthResult = await healthResponse.json();
      setHealthData(healthResult);
      console.log('Health result:', healthResult);

      // Test opportunities endpoint
      console.log('Testing opportunities endpoint...');
      const opportunitiesResponse = await fetch('/api/opportunities');
      const opportunitiesResult = await opportunitiesResponse.json();
      setOpportunitiesData(opportunitiesResult);
      console.log('Opportunities result:', opportunitiesResult);

    } catch (err) {
      console.error('API test error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">API Test Page</h1>
        
        <div className="mb-8">
          <button
            onClick={testAPIs}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test APIs'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Health Check Results */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Health Check</h2>
            {healthData ? (
              <div>
                <div className="mb-4">
                  <span className="font-medium">Status: </span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    healthData.status === 'healthy' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {healthData.status}
                  </span>
                </div>
                <div className="mb-4">
                  <span className="font-medium">API Configured: </span>
                  <span className={`px-2 py-1 rounded text-sm ${
                    healthData.api_configured ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {healthData.api_configured ? 'Yes' : 'No'}
                  </span>
                </div>
                <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                  {JSON.stringify(healthData, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-gray-500">No data yet</p>
            )}
          </div>

          {/* Opportunities API Results */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Opportunities API</h2>
            {opportunitiesData ? (
              <div>
                {Array.isArray(opportunitiesData) ? (
                  <div>
                    <div className="mb-4">
                      <span className="font-medium">Opportunities Found: </span>
                      <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">
                        {opportunitiesData.length}
                      </span>
                    </div>
                    <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto max-h-64">
                      {JSON.stringify(opportunitiesData, null, 2)}
                    </pre>
                  </div>
                ) : (
                  <div>
                    <div className="mb-4">
                      <span className="font-medium">Error: </span>
                      <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm">
                        {opportunitiesData.error || 'Unknown error'}
                      </span>
                    </div>
                    <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                      {JSON.stringify(opportunitiesData, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-gray-500">No data yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
