import Link from 'next/link';
export default function NotFound() {
  return <div className="staff-error"><h1>Record not found</h1><p>The record is unavailable or the link is invalid.</p><Link className="staff-button" href="/admin/dashboard">Administrator overview</Link></div>;
}
