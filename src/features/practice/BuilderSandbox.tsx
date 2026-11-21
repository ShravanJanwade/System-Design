import { Link } from 'react-router';
import { ArchitectureBuilder } from '@/features/builder/Builder';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import { usePractice } from '@/state/practice';
import { PracticeTrail } from './parts';

/** /practice/builder: the architecture builder on a free canvas, with no problem attached. */
export default function BuilderSandbox() {
  const design = usePractice((s) => s.sandbox);
  const setSandbox = usePractice((s) => s.setSandbox);
  return (
    <Page>
      <div className="flex flex-col gap-3">
        <PracticeTrail />
        <PageHeader
          title="Architecture builder"
          intro="A free canvas for any design. Place components, connect them, then check the design against general rules."
        >
          <p className="text-ui text-graphite">
            Your sandbox is saved in this browser. To check a design against a problem’s own load and requirements, open the problem from the{' '}
            <Link to="/problems" className="md-link">
              problem bank
            </Link>{' '}
            and use its canvas.
          </p>
        </PageHeader>
      </div>
      <ArchitectureBuilder design={design} onChange={setSandbox} label="Sandbox canvas" />
    </Page>
  );
}
