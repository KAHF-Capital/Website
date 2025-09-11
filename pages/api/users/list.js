import { supabase } from '../../../lib/supabase'
import { getServerSession } from 'next-auth/next'
import { authOptions } from '../auth/[...nextauth]'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // Check if user is authenticated and is admin
    const session = await getServerSession(req, res, authOptions)
    
    if (!session) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    // For now, allow any authenticated user to view the list
    // You can add admin role checking here later
    // if (session.user.role !== 'admin') {
    //   return res.status(403).json({ error: 'Admin access required' })
    // }

    // Get all users from database
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, email, phone, created_at, last_login, is_active')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Database error:', error)
      return res.status(500).json({ error: 'Failed to fetch users' })
    }

    // Format the data for display
    const formattedUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
      last_login: user.last_login,
      is_active: user.is_active,
      days_since_registration: user.created_at ? 
        Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)) : 0
    }))

    res.status(200).json({
      users: formattedUsers,
      total: formattedUsers.length,
      active_users: formattedUsers.filter(u => u.is_active).length
    })

  } catch (error) {
    console.error('Error fetching users:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
