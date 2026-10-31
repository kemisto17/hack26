import Link from 'next/link';
export default function NotFound() { return <div className="staff-error"><h1>Record not found</h1><p>The record is unavailable or outside your authorized scope.</p><Link className="staff-button" href="/staff/dashboard">Return to overview</Link></div>; }
