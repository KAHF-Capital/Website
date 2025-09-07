import { createUser } from '../../../lib/auth-utils'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { name, email, password } = req.body

  // Validation
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' })
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' })
  }

  try {
    const user = await createUser({
      name,
      email,
      password,
      provider: 'credentials'
    })

    // Return user without password
    const { password: _, ...userWithoutPassword } = user
    res.status(201).json({ 
      message: 'User created successfully',
      user: userWithoutPassword 
    })
  } catch (error) {
    if (error.message === 'User already exists') {
      return res.status(409).json({ error: 'User with this email already exists' })
    }
    
    console.error('Registration error:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
