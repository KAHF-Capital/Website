#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('🚀 Dark Pool Scanner Environment Setup\n');

// Check if .env.local already exists
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  console.log('⚠️  .env.local already exists!');
  rl.question('Do you want to overwrite it? (y/N): ', (answer) => {
    if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
      setupEnvironment();
    } else {
      console.log('Setup cancelled. Your existing .env.local file was preserved.');
      rl.close();
    }
  });
} else {
  setupEnvironment();
}

function setupEnvironment() {
  console.log('\n📝 Please provide your Polygon.io API key:');
  console.log('   Get your API key from: https://polygon.io\n');
  
  rl.question('Enter your Polygon API key: ', (apiKey) => {
    if (!apiKey.trim()) {
      console.log('❌ API key cannot be empty. Please run the setup again.');
      rl.close();
      return;
    }

    // Create .env.local content
    const envContent = `# Polygon.io API Configuration
# Get your API key from https://polygon.io
# Copy this file to .env.local and replace with your actual API key
POLYGON_API_KEY=${apiKey.trim()}

# NextAuth.js Configuration
# Generate a random secret: openssl rand -base64 32
NEXTAUTH_SECRET=your_nextauth_secret_here
NEXTAUTH_URL=http://localhost:3000
`;

    try {
      fs.writeFileSync(envPath, envContent);
      console.log('\n✅ Environment file created successfully!');
      console.log('📁 File location: .env.local');
      console.log('\n🚀 Next steps:');
      console.log('1. Run: npm install');
      console.log('2. Run: npm run dev');
      console.log('3. Visit: http://localhost:3000/scanner');
      console.log('\n💡 Remember to add this API key to your Vercel environment variables for deployment!');
    } catch (error) {
      console.error('❌ Error creating environment file:', error.message);
    }

    rl.close();
  });
}


