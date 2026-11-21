import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ButtonLink } from '@/design/Button';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Something went wrong while loading this page.';
  return (
    <main className="measure px-6 py-16">
      <h1 className="font-display text-title-sm font-semibold text-ink">This page could not load</h1>
      <p className="mt-3 text-ui-lg text-graphite">{message}</p>
      <p className="mt-2 text-ui-lg text-graphite">Reload the page to try again. Your progress is saved in this browser.</p>
      <ButtonLink to="/" className="mt-6">
        Go to Home
      </ButtonLink>
    </main>
  );
}
