'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/customer-web/icons';

export type TableRow = { id: string; href?: string; status: string; cells: string[]; sortKeys?: string[] };
export function selectRows(rows: TableRow[], search: string, status: string, column: number, descending: boolean) {
  const query = search.trim().toLocaleLowerCase();
  return rows.filter(row => (status === 'all' || row.status === status) && row.cells.some(value => value.toLocaleLowerCase().includes(query)))
    .sort((a, b) => (a.sortKeys?.[column] ?? a.cells[column] ?? '').localeCompare(b.sortKeys?.[column] ?? b.cells[column] ?? '', undefined, { numeric: true }) * (descending ? -1 : 1));
}
export function DataTable({ title, columns, rows, statuses = [], unavailable, nextHref }: {
  title: string; columns: string[]; rows: TableRow[]; statuses?: string[]; unavailable?: string; nextHref?: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [column, setColumn] = useState(0);
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(0);
  const filtered = selectRows(rows, query, status, column, descending);
  const pages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pages - 1);
  const shown = filtered.slice(currentPage * 10, currentPage * 10 + 10);
  return <section className="staff-table-card" aria-label={title}>
    <div className="staff-table-tools"><label className="staff-search"><Icon name="search" size={17} /><span className="sr-only">Search {title.toLowerCase()} in loaded results</span><input type="search" placeholder={`Search ${title.toLowerCase()}…`} value={query} disabled={!!unavailable} onChange={e => { setQuery(e.target.value); setPage(0); }} /></label><label className="staff-filter">Status<select value={status} disabled={!!unavailable} onChange={e => { setStatus(e.target.value); setPage(0); }}><option value="all">All statuses</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label></div>
    <div className="staff-table-scroll"><table><caption className="sr-only">{title}. Search and sorting apply to the loaded batch.</caption><thead><tr>{columns.map((name, index) => <th key={name} scope="col" aria-sort={column === index ? descending ? 'descending' : 'ascending' : 'none'}><button disabled={!!unavailable} onClick={() => { setColumn(index); setDescending(index === column ? !descending : false); setPage(0); }}>{name}<span aria-hidden="true">{column === index ? descending ? ' ↓' : ' ↑' : ' ↕'}</span></button></th>)}</tr></thead><tbody>{shown.map(row => <tr key={row.id}>{row.cells.map((value, index) => <td key={index}>{index === 0 && row.href ? <Link className="staff-record-link" href={row.href}>{value}</Link> : value === row.status ? <span className={`staff-status ${['Active', 'Paid', 'Recorded'].includes(value) ? 'positive' : ''}`}>{value}</span> : value}</td>)}</tr>)}</tbody></table></div>
    {unavailable ? <div className="staff-table-empty" role="status"><Icon name="layers" size={28} /><h3>{title} unavailable</h3><p>{unavailable}</p><span className="staff-tag">Integration pending</span></div> : shown.length === 0 ? <div className="staff-table-empty"><Icon name="search" size={28} /><h3>{rows.length ? 'No matching records' : `No ${title.toLowerCase()} yet`}</h3><p>{rows.length ? 'Try another search or clear your filters.' : 'Records will appear here when they are available.'}</p>{rows.length > 0 && <button className="staff-button secondary" onClick={() => { setQuery(''); setStatus('all'); setPage(0); }}>Clear filters</button>}</div> : null}
    <footer className="staff-table-footer"><span>{unavailable ? 'No records loaded' : `${filtered.length} matching records in this batch · Page ${currentPage + 1} of ${pages}`}</span><div><button disabled={!!unavailable || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button><button disabled={!!unavailable || currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</button>{nextHref && <Link href={nextHref}>Load next batch →</Link>}</div></footer>
  </section>;
}
