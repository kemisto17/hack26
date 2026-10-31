import { adminDirectory } from './session';
import { AdminHeading, ButtonLink, Card, Notice } from './ui';

export const permissionRows = [
  ['Customer directory', 'Read all', 'Read all', 'Own profile'],
  ['Catalog & pricing configuration', 'Configure¹', 'Read¹', 'Safe active catalog¹'],
  ['Quotation preparation', 'Manage¹', 'Manage¹', 'Read own visible records¹'],
  ['Subscription lifecycle', 'Plan-gated¹', 'Plan-gated¹', 'Own, plan-gated¹'],
  ['Invoice operations', 'Manage¹', 'Manage¹', 'Read/print own issued¹'],
  ['Record received payments', 'Record¹', 'Record¹', 'Not allowed'],
  ['Financial reports', 'Read¹', 'Read¹', 'Not allowed'],
  ['Invite staff / change account access', 'Allowed', 'Not allowed', 'Not allowed'],
  ['Support / global settings', 'No contract', 'No contract', 'No contract'],
] as const;

export async function RolesPage() {
  const directory = await adminDirectory('users');
  const complete = directory.next_cursor === null;
  return <><AdminHeading title="Roles & permissions" description="Three fixed roles, enforced by current account identity and owned services."><ButtonLink secondary href="/admin/staff">Manage account roles</ButtonLink></AdminHeading>
    <div className="admin-role-cards">{([
      ['admin', 'Administrator', 'Business-wide access and account administration.'],
      ['internal', 'Internal staff', 'Customer operations without commercial configuration or staff administration.'],
      ['customer', 'Customer', 'Own account and permitted customer records only.'],
    ] as const).map(([role, label, description]) => <Card key={role} title={label}><div className="staff-card-padding"><code>{role}</code><p>{description}</p><strong className="admin-role-count">{directory.items.filter(user => user.role === role).length}</strong><small>{complete ? 'Assigned accounts' : 'Assigned accounts in loaded batch only'}</small></div></Card>)}</div>
    <Notice>Roles are fixed by the backend; custom permission editing is not supported. Assign roles from an account’s access panel. The backend protects the last active administrator, including concurrent changes.</Notice>
    <Card title="Permission reference" description="¹ Documented capability; the associated application workflow is not connected yet."><div className="staff-table-scroll"><table><thead><tr><th scope="col">Module</th><th scope="col">Administrator</th><th scope="col">Internal staff</th><th scope="col">Customer</th></tr></thead><tbody>{permissionRows.map(row => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th scope="row" key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody></table></div></Card>
  </>;
}
