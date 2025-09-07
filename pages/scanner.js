import Scanner from '../src/pages/Scanner'
import ErrorBoundary from '../src/components/ErrorBoundary'
import ProtectedRoute from '../src/components/ProtectedRoute'

export default function ScannerPage() {
  return (
    <ProtectedRoute>
      <ErrorBoundary>
        <Scanner />
      </ErrorBoundary>
    </ProtectedRoute>
  )
}
