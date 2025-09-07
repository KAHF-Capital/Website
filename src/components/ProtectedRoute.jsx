import { useSession } from 'next-auth/react'
import { useRouter } from 'next/router'
import { useEffect } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Lock, ArrowRight, Zap } from 'lucide-react'

export default function ProtectedRoute({ children, requireSubscription = false }) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'loading') return // Still loading

    if (!session) {
      // Store the current URL to redirect back after login
      const currentUrl = router.asPath
      router.push(`/auth/signin?callbackUrl=${encodeURIComponent(currentUrl)}`)
      return
    }

    if (requireSubscription && session.user.subscriptionStatus === 'free') {
      // User is logged in but needs subscription
      return
    }
  }, [session, status, router, requireSubscription])

  // Show loading state
  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    )
  }

  // Show login prompt for unauthenticated users
  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-lg p-8 text-center"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in required</h2>
            <p className="text-gray-600 mb-6">
              You need to sign in to access this tool.
            </p>
            <div className="space-y-3">
              <Link href="/auth/signin">
                <button className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center justify-center">
                  Sign In
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </Link>
              <Link href="/auth/signup">
                <button className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium">
                  Create Account
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // Show subscription required prompt
  if (requireSubscription && session.user.subscriptionStatus === 'free') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-lg shadow-lg p-8 text-center"
          >
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Subscription Required</h2>
            <p className="text-gray-600 mb-6">
              This feature requires a VolAlert Pro subscription. Upgrade now to access all tools and features.
            </p>
            <div className="space-y-3">
              <a 
                href="https://buy.stripe.com/4gM8wR0ol1AU1q3eS50oM01"
                target="_blank"
                rel="noopener noreferrer"
              >
                <button className="w-full bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium flex items-center justify-center">
                  <Zap className="mr-2 h-4 w-4" />
                  Subscribe to VolAlert Pro
                  <ArrowRight className="ml-2 h-4 w-4" />
                </button>
              </a>
              <Link href="/">
                <button className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-3 rounded-lg font-medium">
                  Back to Home
                </button>
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    )
  }

  // User is authenticated and has required subscription
  return children
}
