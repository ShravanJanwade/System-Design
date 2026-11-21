import { Link } from 'react-router';
import { Chip } from '@/design/primitives';
import { Page, PageHeader } from '@/features/shared/PageHeader';
import type { ItemStatus } from './logic';

/** The way back to the practice home, above a mode's title. */
export function PracticeTrail() {
  return (
    <nav aria-label="Breadcrumb" className="text-ui">
      <Link to="/practice" className="md-link">
        Practice
      </Link>
    </nav>
  );
}

const statusChip: Record<ItemStatus, { label: string; tone: 'blueprint' | 'alert' | 'neutral' }> = {
  new: { label: 'New to you', tone: 'blueprint' },
  missed: { label: 'Missed last time', tone: 'alert' },
  right: { label: 'Right last time', tone: 'neutral' },
};

export function ItemStatusChip({ status }: { status: ItemStatus }) {
  const c = statusChip[status];
  return <Chip tone={c.tone}>{c.label}</Chip>;
}

export function PageLoading({ what }: { what: string }) {
  return (
    <Page>
      <p className="text-ui text-graphite" role="status">
        Loading {what}
      </p>
    </Page>
  );
}

export function ModeNotFound() {
  return (
    <Page>
      <PageHeader title="Practice mode not found" intro="There is no practice mode at this address." />
      <Link to="/practice" className="md-link text-ui-lg">
        See all practice modes
      </Link>
    </Page>
  );
}
