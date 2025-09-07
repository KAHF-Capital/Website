import { getServerSession } from 'next-auth/next'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const session = await getServerSession(req, res, {
      // This should match your NextAuth configuration
      secret: process.env.NEXTAUTH_SECRET,
    })

    res.status(200).json({
      message: 'Auth test endpoint working',
      session: session || null,
      hasSession: !!session,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Auth test error:', error)
    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    })
  }
}
