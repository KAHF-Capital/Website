import Scanner from '../src/pages/Scanner'
import ErrorBoundary from '../src/components/ErrorBoundary'

export default function ScannerPage() {
  return (
    <ErrorBoundary>
      <Scanner />
    </ErrorBoundary>
  )
}
