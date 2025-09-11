import { supabase } from '../../../lib/supabase'
import bcrypt from 'bcryptjs'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, phone, password } = req.body

  // Validation
  if (!name || !email || !phone || !password) {
    return res.status(400).json({ error: 'All fields are required' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' })
  }

  // Phone number validation
  const phoneRegex = /^[\+]?[1-9][\d]{0,15}$/
  if (!phoneRegex.test(phone.replace(/[\s\-\(\)]/g, ''))) {
    return res.status(400).json({ error: 'Please enter a valid phone number' })
  }

  try {
    // Check if user already exists
    const { data: existingUser, error: checkError } = await supabase
      .from('users')
      .select('email')
      .eq('email', email)
      .single()

    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' })
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Insert user into database
    const { data, error } = await supabase
      .from('users')
      .insert([
        {
          name,
          email,
          phone,
          password: hashedPassword,
          created_at: new Date().toISOString(),
          last_login: null,
          is_active: true
        }
      ])
      .select()

    if (error) {
      console.error('Database error:', error)
      return res.status(500).json({ error: 'Failed to create user account' })
    }

    // Return user data (without password)
    const user = data[0]
    delete user.password

    res.status(201).json({
      message: 'User registered successfully',
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        created_at: user.created_at
      }
    })

  } catch (error) {
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
