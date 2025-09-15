#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

console.log('🚀 Dark Pool Straddle Automation Setup\n');

// Check if .env.local exists
const envPath = path.join(__dirname, '.env.local');
const envExists = fs.existsSync(envPath);

if (!envExists) {
  console.log('❌ .env.local file not found!');
  console.log('💡 Run: node setup-env.js first to create the basic environment file');
  process.exit(1);
}

// Read existing .env.local
let envContent = '';
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (error) {
  console.error('❌ Error reading .env.local:', error.message);
  process.exit(1);
}

// Parse existing environment variables
const existingVars = {};
const lines = envContent.split('\n');
lines.forEach(line => {
  if (line.includes('=') && !line.startsWith('#')) {
    const [key, value] = line.split('=');
    existingVars[key.trim()] = value.trim();
  }
});

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper function to ask questions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

// Helper function to ask yes/no questions
async function askYesNo(question, defaultValue = false) {
  const answer = await askQuestion(`${question} (y/n) [${defaultValue ? 'y' : 'n'}]: `);
  if (answer === '') return defaultValue;
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

// Helper function to ask for numbers
async function askNumber(question, defaultValue, min = null, max = null) {
  while (true) {
    const answer = await askQuestion(`${question} [${defaultValue}]: `);
    if (answer === '') return defaultValue;
    
    const num = parseFloat(answer);
    if (isNaN(num)) {
      console.log('❌ Please enter a valid number');
      continue;
    }
    
    if (min !== null && num < min) {
      console.log(`❌ Please enter a number >= ${min}`);
      continue;
    }
    
    if (max !== null && num > max) {
      console.log(`❌ Please enter a number <= ${max}`);
      continue;
    }
    
    return num;
  }
}

async function setupAutomation() {
  console.log('📋 This will help you configure the Dark Pool Straddle Automation system.\n');
  
  // Check if user wants to enable automation
  const enableAutomation = await askYesNo('Do you want to enable the automation system?', true);
  
  if (!enableAutomation) {
    console.log('✅ Automation disabled. You can enable it later by setting AUTOMATION_ENABLED=true in .env.local');
    rl.close();
    return;
  }

  console.log('\n🔧 Core Automation Settings:');
  
  // Dark pool activity threshold
  const minDarkPoolActivity = await askNumber(
    'Minimum dark pool activity ratio (300% = 3.0)',
    3.0,
    1.0,
    10.0
  );
  
  // Profitable threshold
  const profitableThreshold = await askNumber(
    'Minimum profitability threshold for alerts (%)',
    55,
    30,
    90
  );
  
  // Maximum tickers to analyze
  const maxTickers = await askNumber(
    'Maximum number of tickers to analyze per run',
    50,
    10,
    200
  );

  console.log('\n📱 Notification Settings:');
  
  // SMS notifications
  const enableSMS = await askYesNo('Do you want to enable SMS notifications?', true);
  
  let twilioConfig = {};
  if (enableSMS) {
    console.log('\n📞 Twilio SMS Configuration:');
    console.log('You can get these from https://console.twilio.com/');
    
    const twilioAccountSid = await askQuestion('Twilio Account SID: ');
    const twilioAuthToken = await askQuestion('Twilio Auth Token: ');
    const twilioPhoneNumber = await askQuestion('Twilio Phone Number (e.g., +1234567890): ');
    const recipientPhoneNumber = await askQuestion('Your phone number for alerts (e.g., +1234567890): ');
    
    twilioConfig = {
      TWILIO_ACCOUNT_SID: twilioAccountSid,
      TWILIO_AUTH_TOKEN: twilioAuthToken,
      TWILIO_PHONE_NUMBER: twilioPhoneNumber,
      RECIPIENT_PHONE_NUMBER: recipientPhoneNumber
    };
  }

  console.log('\n⏰ Scheduling Settings:');
  
  // Scheduling
  const enableSchedule = await askYesNo('Do you want to enable automatic daily scheduling?', true);
  
  let scheduleConfig = {};
  if (enableSchedule) {
    const cronExpression = await askQuestion('Cron expression for scheduling (e.g., "0 9 * * 1-5" for 9 AM weekdays) [0 9 * * 1-5]: ');
    const timezone = await askQuestion('Timezone [America/New_York]: ');
    
    scheduleConfig = {
      SCHEDULE_ENABLED: 'true',
      CRON_EXPRESSION: cronExpression || '0 9 * * 1-5',
      TIMEZONE: timezone || 'America/New_York'
    };
  }

  // Build new environment variables
  const newEnvVars = {
    // Core automation
    AUTOMATION_ENABLED: 'true',
    MIN_DARK_POOL_ACTIVITY: minDarkPoolActivity.toString(),
    PROFITABLE_THRESHOLD: profitableThreshold.toString(),
    MAX_TICKERS_TO_ANALYZE: maxTickers.toString(),
    
    // Notifications
    SEND_ALERTS: 'true',
    SMS_ALERTS_ENABLED: enableSMS.toString(),
    EMAIL_ALERTS_ENABLED: 'false', // Not implemented yet
    
    // Logging
    LOG_LEVEL: 'info',
    
    // Twilio config
    ...twilioConfig,
    
    // Schedule config
    ...scheduleConfig
  };

  // Update .env.local file
  let updatedEnvContent = envContent;
  
  // Add or update each variable
  Object.keys(newEnvVars).forEach(key => {
    const value = newEnvVars[key];
    const regex = new RegExp(`^${key}=.*$`, 'm');
    
    if (regex.test(updatedEnvContent)) {
      // Update existing variable
      updatedEnvContent = updatedEnvContent.replace(regex, `${key}=${value}`);
    } else {
      // Add new variable
      updatedEnvContent += `\n# Automation Configuration\n${key}=${value}`;
    }
  });

  // Write updated .env.local
  try {
    fs.writeFileSync(envPath, updatedEnvContent);
    console.log('\n✅ .env.local updated successfully!');
  } catch (error) {
    console.error('❌ Error writing .env.local:', error.message);
    rl.close();
    return;
  }

  // Display configuration summary
  console.log('\n📊 Configuration Summary:');
  console.log(`   Automation Enabled: ${enableAutomation}`);
  console.log(`   Min Dark Pool Activity: ${minDarkPoolActivity}x (${minDarkPoolActivity * 100}%)`);
  console.log(`   Profitable Threshold: ${profitableThreshold}%`);
  console.log(`   Max Tickers to Analyze: ${maxTickers}`);
  console.log(`   SMS Notifications: ${enableSMS}`);
  console.log(`   Daily Scheduling: ${enableSchedule}`);

  console.log('\n🚀 Next Steps:');
  console.log('1. Test the automation: POST to /api/run-automation');
  console.log('2. Set up a cron job or use Vercel Cron for daily scheduling');
  console.log('3. Monitor the logs to ensure everything is working correctly');
  
  if (enableSMS && (!twilioConfig.TWILIO_ACCOUNT_SID || !twilioConfig.RECIPIENT_PHONE_NUMBER)) {
    console.log('\n⚠️  Warning: SMS configuration incomplete. Update .env.local with your Twilio credentials.');
  }

  rl.close();
}

// Run the setup
setupAutomation().catch(error => {
  console.error('❌ Setup failed:', error.message);
  rl.close();
  process.exit(1);
});
