import { useEffect } from 'react';
import { ButtonLink } from '@/design/Button';

export default function NotFound() {
  useEffect(() => {
    document.title = 'Page not found — Blueprint';
  }, []);
  return (
    <div className="measure px-4 py-16 sm:px-10">
      <h1 className="font-display text-title-sm font-semibold text-ink sm:text-title">Page not found</h1>
      <p className="mt-3 text-ui-lg text-graphite">There is nothing at this address. Check the link, or start from Home.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink to="/" variant="primary">
          Go to Home
        </ButtonLink>
        <ButtonLink to="/learn">Open the curriculum</ButtonLink>
      </div>
    </div>
  );
}
