import { lazy, Suspense } from 'react';
import { useParams } from 'react-router';
import { isDrillMode } from '@/state/practice';
import { FlashcardReview } from './FlashcardReview';
import { PracticeHome } from './PracticeHome';
import { ModeNotFound, PageLoading } from './parts';

// The drills (with their diagrams) and the builder load only when opened.
const DrillPage = lazy(() => import('./DrillPage'));
const BuilderSandbox = lazy(() => import('./BuilderSandbox'));

/** /practice and /practice/:mode. */
export default function PracticePage() {
  const { mode } = useParams();
  if (!mode) return <PracticeHome />;
  if (mode === 'flashcards') return <FlashcardReview />;
  if (isDrillMode(mode)) {
    return (
      <Suspense fallback={<PageLoading what="questions" />}>
        <DrillPage key={mode} mode={mode} />
      </Suspense>
    );
  }
  if (mode === 'builder') {
    return (
      <Suspense fallback={<PageLoading what="the builder" />}>
        <BuilderSandbox />
      </Suspense>
    );
  }
  return <ModeNotFound />;
}
