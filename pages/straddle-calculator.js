// Legacy route — preserved so old bookmarks/SEO links keep working.
// The calculator no longer differentiates between strategies; it finds the
// best one automatically. Render the unified calculator.
import OptionsCalculator from '../src/pages/OptionsCalculator';

export default function StraddleCalculatorPage() {
  return <OptionsCalculator />;
}
