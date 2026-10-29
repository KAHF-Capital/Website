import NewsScanner from '../src/pages/NewsScanner';
import ErrorBoundary from '../src/components/ErrorBoundary';

export default function NewsScannerPage() {
  return (
    <ErrorBoundary>
      <NewsScanner />
    </ErrorBoundary>
  );
}
