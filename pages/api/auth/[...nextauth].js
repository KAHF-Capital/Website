import NextAuth from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'

export default NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null
        }

        try {
          // Import here to avoid circular dependency issues
          const { verifyUser } = await import('../../../lib/auth-utils')
          const user = await verifyUser(credentials.email, credentials.password)
          if (user) {
            return {
              id: user.id,
              email: user.email,
              name: user.name,
              subscriptionStatus: user.subscriptionStatus || 'free'
            }
          }
        } catch (error) {
          console.error('Auth error:', error)
        }
        
        return null
      }
    })
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google') {
        try {
          // Import here to avoid circular dependency issues
          const { getUserByEmail, createUser } = await import('../../../lib/auth-utils')
          
          // Check if user exists, if not create them
          let existingUser = await getUserByEmail(user.email)
          if (!existingUser) {
            existingUser = await createUser({
              email: user.email,
              name: user.name,
              provider: 'google'
            })
          }
          
          // Add subscription status to user object
          user.subscriptionStatus = existingUser.subscriptionStatus || 'free'
          user.id = existingUser.id
        } catch (error) {
          console.error('Google signin error:', error)
          return false
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) {
        token.subscriptionStatus = user.subscriptionStatus
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id
        session.user.subscriptionStatus = token.subscriptionStatus
      }
      return session
    }
  },
  pages: {
    signIn: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET,
  debug: process.env.NODE_ENV === 'development',
})
