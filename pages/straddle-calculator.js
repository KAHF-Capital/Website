import StraddleCalculator from '../src/pages/StraddleCalculator';
import ProtectedRoute from '../src/components/ProtectedRoute';

export default function StraddleCalculatorPage() {
  return (
    <ProtectedRoute requireSubscription={true}>
      <StraddleCalculator />
    </ProtectedRoute>
  );
}
