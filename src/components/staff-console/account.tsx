import { ProfileForm } from '@/modules/identity/profile-form';
import { SignOut } from '@/modules/identity/sign-out';
import { requireStaff } from './session';
import { ButtonLink, Card, DetailGrid, Heading, Notice } from './ui';
export async function Profile() {
  const user = await requireStaff();
  return <><Heading title="My profile" description="Manage your display name and review your staff account." /><div className="staff-two-column"><Card title="Personal information"><div className="staff-card-padding"><ProfileForm user={user} /></div></Card><Card title="Access details"><DetailGrid items={[
    ['Role', user.role === 'admin' ? 'Administrator' : 'Internal staff'], ['Account status', user.is_active ? 'Active' : 'Inactive'], ['Email & phone', 'Not included in the profile contract'], ['Account ID', user.id],
  ]} /><div className="staff-card-padding"><p>Roles and permissions are managed by an administrator. They cannot be edited from this profile.</p></div></Card></div></>;
}
export function Settings() {
  return <><Heading title="Preferences" description="Account security and communication preferences." /><div className="staff-two-column"><Card title="Security" description="Managed by the existing authentication service."><div className="staff-card-padding staff-stack"><p>Request a secure password-reset link through the sign-in system.</p><ButtonLink secondary href="/reset-password">Reset password</ButtonLink><hr /><h3>Current session</h3><p>Sign out of this browser when you finish working.</p><SignOut /></div></Card><Card title="Notification preferences"><div className="staff-card-padding"><Notice>Preference persistence is not connected. No changes can be saved.</Notice><fieldset disabled className="staff-preferences"><label><input type="checkbox" /> Email updates</label><label><input type="checkbox" /> Invoice reminders</label><label><input type="checkbox" /> Support notifications</label></fieldset></div></Card></div></>;
}
