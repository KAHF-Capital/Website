import React, { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Key, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

const ApiKeyInput = ({ onApiKeySet, isInitialized = false }) => {
  const [apiKey, setApiKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsLoading(true);
    setStatus('loading');
    setErrorMessage('');

    try {
      const response = await fetch('/api/initialize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ api_key: apiKey }),
      });

      if (response.ok) {
        setStatus('success');
        onApiKeySet(apiKey);
        // Store API key in localStorage (consider more secure storage for production)
        localStorage.setItem('polygon_api_key', apiKey);
      } else {
        const errorData = await response.json();
        setStatus('error');
        setErrorMessage(errorData.detail || 'Failed to initialize API');
      }
    } catch (error) {
      setStatus('error');
      setErrorMessage('Network error. Please check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'loading':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600" />;
      default:
        return <Key className="h-4 w-4 text-gray-600" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'success':
        return 'API Initialized';
      case 'error':
        return 'Initialization Failed';
      case 'loading':
        return 'Initializing...';
      default:
        return 'Enter API Key';
    }
  };

  if (isInitialized) {
    return (
      <div className="flex items-center space-x-2">
        <Badge variant="outline" className="flex items-center space-x-1">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <span>API Connected</span>
        </Badge>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-2">
          {getStatusIcon()}
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-1">
          {getStatusText()}
        </h3>
        <p className="text-sm text-gray-600">
          Enter your Polygon.io API key to start analyzing dark pool activity
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="api-key" className="block text-sm font-medium text-gray-700 mb-1">
            Polygon.io API Key
          </label>
          <Input
            id="api-key"
            type="password"
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            disabled={isLoading}
            className="w-full"
            required
          />
        </div>

        {status === 'error' && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            {errorMessage}
          </div>
        )}

        <Button
          type="submit"
          disabled={isLoading || !apiKey.trim()}
          className="w-full"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Initializing...
            </>
          ) : (
            'Initialize API'
          )}
        </Button>
      </form>

      <div className="mt-4 text-xs text-gray-500">
        <p>Don't have an API key? Get one at{' '}
          <a 
            href="https://polygon.io" 
            target="_blank" 
            rel="noopener noreferrer"
            className="text-blue-600 hover:underline"
          >
            polygon.io
          </a>
        </p>
      </div>
    </div>
  );
};

export default ApiKeyInput;

