import React, { useState, useEffect } from 'react';

export default function TestScanner() {
  const [status, setStatus] = useState('Loading...');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    testScanner();
  }, []);

  const testScanner = async () => {
    try {
      setStatus('Testing health endpoint...');
      const healthResponse = await fetch('/api/health');
      const healthData = await healthResponse.json();
      
      setStatus('Testing opportunities endpoint...');
      const opportunitiesResponse = await fetch('/api/opportunities');
      const opportunitiesData = await opportunitiesResponse.json();
      
      setData({
        health: healthData,
        opportunities: opportunitiesData,
        timestamp: new Date().toISOString()
      });
      setStatus('Test completed successfully');
      
    } catch (err) {
      setError(err.message);
      setStatus('Test failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Scanner Test Page</h1>
        
        <div className="mb-8">
          <button
            onClick={testScanner}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Run Test
          </button>
        </div>

        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-2">Status: {status}</h2>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Health Check Results</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(data.health, null, 2)}
              </pre>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Opportunities API Results</h2>
              <pre className="bg-gray-100 p-4 rounded text-sm overflow-auto">
                {JSON.stringify(data.opportunities, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
