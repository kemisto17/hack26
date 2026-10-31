"use client";
export default function PublicError({ reset }: {
    reset: () => void;
}) { return <main id="main-content" className="public-section site-container"><h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 15 }}>This page couldn’t be loaded.</h1><p>Please try again in a moment.</p><button className="button button-primary" style={{ marginTop: 20 }} type="button" onClick={reset}>Try again</button></main>; }
