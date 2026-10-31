 'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="staff-error" role="alert"><h1>We couldn’t load this admin page</h1><p>Retry the page. If an account update was in progress, refresh its current state before submitting again.</p><button className="staff-button" onClick={() => reset()}>Try again</button><a className="staff-button secondary" href="/admin/dashboard">Return to overview</a></div>;
}
