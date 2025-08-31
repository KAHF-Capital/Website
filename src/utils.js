// API Error handling utilities
export class APIError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.details = details;
  }
}

// Enhanced fetch with timeout and error handling
export async function fetchWithTimeout(url, options = {}, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      let errorData = null;
      try {
        errorData = await response.json();
      } catch {
        // If response is not JSON, use status text
        errorData = { error: response.statusText };
      }
      
      throw new APIError(
        errorData.error || `HTTP ${response.status}`,
        response.status,
        errorData.details
      );
    }
    
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new APIError('Request timed out', 408);
    }
    
    if (error instanceof APIError) {
      throw error;
    }
    
    throw new APIError('Network error', 0, error.message);
  }
}

// Format numbers for display
export function formatNumber(num, decimals = 0) {
  if (num === null || num === undefined || isNaN(num)) {
    return '0';
  }
  
  if (num >= 1000000) {
    return (num / 1000000).toFixed(decimals) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(decimals) + 'K';
  } else {
    return num.toFixed(decimals);
  }
}

// Format currency
export function formatCurrency(amount, currency = 'USD') {
  if (amount === null || amount === undefined || isNaN(amount)) {
    return '$0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

// Format date
export function formatDate(date, options = {}) {
  if (!date) return '';
  
  const defaultOptions = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  
  return new Date(date).toLocaleDateString('en-US', {
    ...defaultOptions,
    ...options
  });
}

// Debounce function
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Throttle function
export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Local storage utilities with error handling
export const storage = {
  get: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
      console.error('Error reading from localStorage:', error);
      return defaultValue;
    }
  },
  
  set: (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Error writing to localStorage:', error);
      return false;
    }
  },
  
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error('Error removing from localStorage:', error);
      return false;
    }
  }
};

// Retry function with exponential backoff
export async function retry(fn, maxAttempts = 3, baseDelay = 1000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

// Validate email format
export function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Validate API key format (basic check)
export function isValidAPIKey(key) {
  return key && 
         typeof key === 'string' && 
         key.length > 10 && 
         key !== 'your_polygon_api_key_here' &&
         key !== 'YOUR_POLYGON_API_KEY_HERE';
}

// Generate unique ID
export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Deep clone object
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}
