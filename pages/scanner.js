import Scanner from '../src/pages/Scanner'
import ErrorBoundary from '../src/components/ErrorBoundary'
import ProtectedRoute from '../src/components/ProtectedRoute'

export default function ScannerPage() {
  return (
    <ErrorBoundary>
      <ProtectedRoute requireSubscription={false}>
        <Scanner />
      </ProtectedRoute>
    </ErrorBoundary>
  )
}
