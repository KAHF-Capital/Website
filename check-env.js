#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔍 Dark Pool Scanner Environment Check\n');

// Check for .env.local file
const envPath = path.join(__dirname, '.env.local');
if (!fs.existsSync(envPath)) {
  console.log('❌ .env.local file not found!');
  console.log('💡 Run: node setup-env.js to create it');
  process.exit(1);
}

// Read and check the environment file
try {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');
  
  let apiKeyFound = false;
  let apiKeyValue = '';
  
  for (const line of lines) {
    if (line.startsWith('POLYGON_API_KEY=')) {
      apiKeyFound = true;
      apiKeyValue = line.split('=')[1]?.trim();
      break;
    }
  }
  
  if (!apiKeyFound) {
    console.log('❌ POLYGON_API_KEY not found in .env.local');
    console.log('💡 Run: node setup-env.js to configure it');
    process.exit(1);
  }
  
  if (!apiKeyValue || apiKeyValue === 'your_polygon_api_key_here') {
    console.log('❌ POLYGON_API_KEY is not set to a valid value');
    console.log('💡 Update .env.local with your actual Polygon API key');
    process.exit(1);
  }
  
  console.log('✅ Environment configuration looks good!');
  console.log('🔑 API Key: ' + apiKeyValue.substring(0, 8) + '...');
  
  // Check if running in development or production
  if (process.env.NODE_ENV === 'production') {
    console.log('🌐 Running in production mode');
    console.log('💡 Make sure to set POLYGON_API_KEY in your Vercel environment variables');
  } else {
    console.log('🛠️  Running in development mode');
  }
  
  console.log('\n🚀 You can now run: npm run dev');
  
} catch (error) {
  console.error('❌ Error reading .env.local:', error.message);
  process.exit(1);
}


