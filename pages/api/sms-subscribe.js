export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    // Validate phone number format (basic validation)
    const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/;
    if (!phoneRegex.test(phoneNumber.replace(/[\s\-\(\)]/g, ''))) {
      return res.status(400).json({ error: 'Invalid phone number format' });
    }

    // Here you would integrate with your SMS service provider
    // For now, we'll just log the subscription and return success
    console.log(`SMS subscription request for: ${phoneNumber}`);

    // TODO: Integrate with SMS service (Twilio, AWS SNS, etc.)
    // Example with Twilio:
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // await client.messages.create({
    //   body: 'You have been subscribed to Dark Pool Scanner alerts!',
    //   from: process.env.TWILIO_PHONE_NUMBER,
    //   to: phoneNumber
    // });

    // Store subscription in database (you'll need to implement this)
    // await db.smsSubscriptions.create({ phoneNumber, subscribedAt: new Date() });

    return res.status(200).json({ 
      success: true, 
      message: 'Successfully subscribed to SMS alerts',
      phoneNumber: phoneNumber 
    });

  } catch (error) {
    console.error('Error subscribing to SMS:', error);
    return res.status(500).json({ 
      error: 'Failed to subscribe to SMS alerts. Please try again later.' 
    });
  }
}
