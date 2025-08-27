import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (you'll need to add your Supabase credentials)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'your_supabase_url';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your_supabase_key';
const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { api_key } = req.body;

    if (!api_key) {
      return res.status(400).json({ error: 'API key is required' });
    }

    // Store the API key securely (you might want to encrypt this)
    // For now, we'll store it in environment variables or a secure database
    
    // You can store it in Supabase or use environment variables
    // For demo purposes, we'll just validate it exists
    
    // TODO: Replace with your actual Polygon.io API key validation
    const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
    
    if (api_key === POLYGON_API_KEY) {
      return res.status(200).json({ 
        message: 'API initialized successfully', 
        status: 'initialized' 
      });
    } else {
      return res.status(401).json({ error: 'Invalid API key' });
    }

  } catch (error) {
    console.error('Error initializing API:', error);
    return res.status(500).json({ error: 'Failed to initialize API' });
  }
}
