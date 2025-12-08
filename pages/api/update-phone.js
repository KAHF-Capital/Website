// Update subscriber phone number
// Called after checkout when customer provides their phone number

import { getSubscriberByCustomerId, addSubscriber, loadSubscribers } from '../../lib/subscribers-store';
import { sendWelcomeMessage, validatePhoneNumber } from '../../lib/twilio-service';
import fs from 'fs';
import path from 'path';

const SUBSCRIBERS_FILE = path.join(process.cwd(), 'data', 'subscribers.json');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { customerId, phoneNumber, email } = req.body;

  if (!customerId) {
    return res.status(400).json({ error: 'Missing customerId' });
  }

  if (!phoneNumber) {
    return res.status(400).json({ error: 'Missing phoneNumber' });
  }

  // Validate phone number format
  const validation = validatePhoneNumber(phoneNumber);
  if (!validation.valid) {
    return res.status(400).json({ 
      error: 'Invalid phone number format. Please use a valid US phone number.' 
    });
  }

  try {
    // Check if subscriber exists
    let subscriber = getSubscriberByCustomerId(customerId);

    if (subscriber) {
      // Update existing subscriber's phone number
      const subscribers = loadSubscribers();
      const index = subscribers.findIndex(s => s.stripeCustomerId === customerId);
      
      if (index >= 0) {
        subscribers[index].phoneNumber = validation.formatted;
        subscribers[index].updatedAt = new Date().toISOString();
        
        // Save updated subscribers
        fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify({ subscribers }, null, 2));
        
        // Send welcome message
        await sendWelcomeMessage(validation.formatted);
        
        return res.status(200).json({
          success: true,
          message: 'Phone number updated successfully'
        });
      }
    }

    // If subscriber doesn't exist, create new one
    subscriber = addSubscriber({
      stripeCustomerId: customerId,
      email: email,
      phoneNumber: validation.formatted
    });

    // Send welcome message
    await sendWelcomeMessage(validation.formatted);

    return res.status(200).json({
      success: true,
      message: 'Subscriber registered successfully'
    });
  } catch (error) {
    console.error('Error updating phone number:', error);
    return res.status(500).json({ error: 'Failed to update phone number' });
  }
}


