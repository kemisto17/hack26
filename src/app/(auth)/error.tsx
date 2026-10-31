"use client";
export default function AuthError({ reset }: {
    reset: () => void;
}) { return <div className="empty-state"><h1>Account access is temporarily unavailable.</h1><p>Check your connection and try again.</p><button className="button button-primary" style={{ marginTop: 20 }} type="button" onClick={reset}>Try again</button></div>; }
