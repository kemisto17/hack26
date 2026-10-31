import Link from 'next/link';
import { ProfileForm } from '@/modules/identity/profile-form';
import { SignOut } from '@/modules/identity/sign-out';
import { PAYMENT_METHOD_LABELS } from '@/modules/billing/contracts';
import { requireAdmin } from './session';
import { AdminHeading, ButtonLink, Card, DetailGrid, Notice, SettingField, Unavailable } from './ui';

export function GeneralSettings() {
  return <><AdminHeading title="General settings" description="Business configuration and account preferences." />
    <div className="admin-settings-links">{[
      ['Business profile', 'Business identity and document details.', 'business'],
      ['Billing settings', 'Payment terms, invoicing and receipt methods.', 'billing'],
      ['Tax settings', 'Tax configuration and treatment.', 'tax'],
      ['Security & permissions', 'Account access and security information.', 'security'],
    ].map(([title, description, path]) => <Link key={path} href={`/admin/settings/${path}`}><h2>{title}</h2><p>{description}</p><span>Open settings →</span></Link>)}</div>
    <Card title="Organization preferences"><Unavailable>Organization timezone, branding and notification preferences have no persistence contract. No frontend-only “saved” configuration is offered.</Unavailable></Card>
  </>;
}

export function BusinessSettings() {
  return <><AdminHeading title="Business profile" description="The identity shown to your customers and on business documents."><ButtonLink secondary href="/admin/settings">All settings</ButtonLink></AdminHeading>
    <Notice>A business-profile service is not available. These fields cannot be loaded or saved, and they do not currently populate invoice documents.</Notice>
    <div className="admin-editor-columns"><Card title="Business identity"><form className="staff-form"><fieldset disabled>
      <SettingField label="Business name" /><SettingField label="Business email" type="email" /><div className="staff-field-pair"><SettingField label="Phone" type="tel" /><SettingField label="Website" type="url" /></div>
      <label>Business address<textarea rows={3} disabled /></label><SettingField label="Legal / business identification" /><label>Logo upload<input type="file" disabled accept="image/png,image/jpeg,image/svg+xml" /></label><button type="button" className="staff-button" disabled>Save business profile unavailable</button>
    </fieldset></form></Card><Card title="Document identity"><Unavailable icon="document">A persisted business profile and explicit invoice/quotation snapshot contract are needed before these details can be displayed on documents.</Unavailable></Card></div>
  </>;
}

export function BillingSettings() {
  return <><AdminHeading title="Billing settings" description="Understand supported invoice and receipt behavior."><ButtonLink secondary href="/admin/settings">All settings</ButtonLink></AdminHeading>
    <Notice>Global billing settings cannot be persisted. Current contracts carry currency on plans/invoices and payment terms on individual subscriptions.</Notice>
    <div className="staff-two-column"><Card title="Invoice defaults"><form className="staff-form"><fieldset disabled>
      <SettingField label="Default currency" hint="No global default contract" /><SettingField label="Invoice numbering" hint="Managed by the billing service" /><SettingField label="Default payment terms (days)" type="number" /><label>Invoice footer<textarea rows={3} disabled /></label><label>Terms and conditions<textarea rows={3} disabled /></label><button type="button" className="staff-button" disabled>Save billing settings unavailable</button>
    </fieldset></form></Card><div className="admin-stack"><Card title="Supported receipt methods" description="Read-only values from the existing billing contract."><div className="admin-tag-list">{Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => <span key={value}>{label}</span>)}</div></Card><Card title="Billing notifications"><Unavailable icon="bell">Delivery and reminder configuration are not connected. Nothing can be scheduled from this page.</Unavailable></Card></div></div>
  </>;
}

export function TaxSettings() {
  return <><AdminHeading title="Tax settings" description="Tax rules remain authoritative in catalog and billing services."><ButtonLink secondary href="/admin/settings">All settings</ButtonLink></AdminHeading>
    <Notice>Tax reads and configuration are not connected. No tax amount is calculated here.</Notice>
    <div className="staff-two-column"><Card title="Tax rule"><form className="staff-form"><fieldset disabled>
      <SettingField label="Tax label" /><SettingField label="Rate (basis points)" type="number" /><div className="staff-field-pair"><SettingField label="Starts on" type="date" /><SettingField label="Ends on" type="date" /></div><button type="button" className="staff-button" disabled>Save tax rule unavailable</button>
    </fieldset></form></Card><Card title="Tax treatment"><div className="staff-card-padding admin-explainer"><h3>One exclusive rule per product</h3><p>The catalog selects the tax rule. Billing snapshots the effective rate and amount onto invoice lines.</p><h3>Keep historical documents stable</h3><p>Tax configuration changes must not rewrite issued invoices.</p><h3>Business tax identification</h3><p>Legal identification requires a separate business-profile contract.</p></div></Card></div>
  </>;
}

export async function SecuritySettings() {
  const user = await requireAdmin();
  return <><AdminHeading title="Security & permissions" description="Current account access and the safeguards enforced by identity services."><ButtonLink secondary href="/admin/roles">Role reference</ButtonLink></AdminHeading>
    <div className="staff-two-column"><Card title="Current verified account"><DetailGrid items={[
      ['Name', user.display_name], ['Role', 'Administrator'], ['Status', 'Active'], ['Account ID', user.id],
    ]} /><div className="staff-card-padding"><ButtonLink secondary href="/reset-password">Request password reset</ButtonLink></div></Card><Card title="Access safeguards"><div className="staff-card-padding admin-explainer"><h3>Current role, every request</h3><p>Supabase Auth and the current active profile determine access. Browser metadata never grants permissions.</p><h3>Protected administrator access</h3><p>The identity transaction prevents removing the last active administrator.</p><h3>Versioned updates</h3><p>Account access changes include the loaded version and reject stale writes.</p></div></Card></div>
    <Card title="Sessions & authentication configuration"><Unavailable icon="shield">Session inventory, provider configuration health, MFA settings and security-event history are not exposed by current services. This page does not infer that those systems are healthy.</Unavailable></Card>
    <Card title="Current browser session"><div className="staff-card-padding"><SignOut /></div></Card>
  </>;
}

export async function AdminProfile() {
  const user = await requireAdmin();
  return <><AdminHeading title="My profile" description="Update your display name using the existing identity workflow." />
    <div className="staff-two-column"><Card title="Personal details"><div className="staff-card-padding"><ProfileForm key={user.version} user={user} /></div></Card><Card title="Administrator account"><DetailGrid items={[
      ['Role', 'Administrator'], ['Status', 'Active'], ['Email & phone', 'Not exposed by the profile contract'], ['Account ID', user.id],
    ]} /><div className="staff-card-padding"><ButtonLink secondary href="/admin/settings/security">Security settings</ButtonLink></div></Card></div>
  </>;
}
