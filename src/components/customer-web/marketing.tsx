import Link from "next/link";
import { PublicShell } from "./public-shell";
import { Icon, type IconName } from "./icons";
import { SectionTitle } from "./ui";
export const features: {
    icon: IconName;
    title: string;
    body: string;
}[] = [
    { icon: "repeat", title: "Subscriptions, with context", body: "Keep the plan, agreed terms and next billing date together. Know where a subscription stands before taking the next step." },
    { icon: "document", title: "A clear quotation trail", body: "Review the products and quantities behind a quotation. Staff manage revisions and confirmation through the authorized workflow." },
    { icon: "layers", title: "Invoices you can understand", body: "See line items, due dates, recorded payments and the remaining balance in one document, once billing is connected." },
    { icon: "wallet", title: "Payments, accounted for", body: "Follow verified receipts recorded by your provider. A payment is shown only when it is recorded, never just because a button was clicked." },
    { icon: "user", title: "Your own customer workspace", body: "Manage your profile and find a dedicated home for your subscriptions, quotations and billing history." },
    { icon: "shield", title: "Access with boundaries", body: "Customer and staff access are separated. Your account information stays behind verified sign-in and current account permissions." },
];
export const faqs = [
    ["What is Brightloop?", "Brightloop is the HACK26 subscription-management application. It brings customer accounts, quotations, subscription terms and recurring billing into a shared workflow for customers and staff."],
    ["Can I create an account today?", "Yes, when the application’s Supabase connection is configured. Create an account, confirm your email, then sign in. Your administrator can help if access is disabled."],
    ["Can I pay an invoice online?", "An online payment gateway is not connected. Payments are verified and recorded by authorized staff; the portal does not collect card details or simulate a successful payment."],
    ["Can I accept a quotation in the portal?", "The current service contract reserves quotation confirmation for staff. You can review a quotation when subscription reads are connected and ask staff to confirm it. Customer acceptance and rejection are not available."],
    ["Can I pause or renew a subscription?", "The planned customer actions depend on the plan’s permissions and the subscription’s current state. They will be available only once the authorized subscription actions are connected. Renewal creates a new draft and retains the original record."],
    ["Where can I get help?", "Visit Help & Support for answers about your account, quotations and billing. A contact delivery channel has not been configured, so a form will never claim that an unsubmitted message was delivered."],
] as const;
export function FAQ({ full = false }: {
    full?: boolean;
}) { return <div className="faq-list">{(full ? faqs : faqs.slice(0, 4)).map(([question, answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div>; }
export function ProductPreview() {
    return <section className="journey-visual" aria-label="Subscription workflow">
        <div className="journey-heading"><span className="eyebrow">The subscription journey</span><Icon name="repeat" size={28} /></div>
        <h2>Connected from<br />the very first quote.</h2>
        <ol className="journey-list">
            {[["document", "Quotation", "The products, prices and terms you agree on."], ["repeat", "Subscription", "Your service, its lifecycle and the next billing date."], ["layers", "Invoice", "A clear record of each period and its balance."], ["wallet", "Payment", "Verified receipts, kept with the invoice."]].map(([icon, title, body]) => <li key={title}><span className="journey-icon"><Icon name={icon as IconName} size={21} /></span><div><h3>{title}</h3><p>{body}</p></div></li>)}
        </ol>
        <p className="journey-caption"><Icon name="shield" size={16} /> A dedicated view for your business and your customers.</p>
    </section>;
}
export function WorkflowCard() { return <div className="workflow-card"><h3>Built around the full journey</h3><p>One connected view, from the first quote to the next renewal.</p>{[["document", "Agree on the details", "Products, quantities and quotation terms"], ["repeat", "Follow your subscription", "Current state and permitted next steps"], ["wallet", "Stay on top of billing", "Issued invoices and recorded receipts"]].map(([icon, title, description]) => <div className="workflow-row" key={title}><span><Icon name={icon as IconName} size={17}/></span><div><strong>{title}</strong><small>{description}</small></div><Icon name="chevron" size={14} style={{ marginLeft: "auto", color: "#b6bfd0" }}/></div>)}</div>; }
export function FeatureCards() { return <div className="feature-grid">{features.map(feature => <article className="feature-card" key={feature.title}><span className="feature-icon"><Icon name={feature.icon} size={22}/></span><h3>{feature.title}</h3><p>{feature.body}</p></article>)}</div>; }
export function FinalCTA() { return <section className="public-section"><div className="site-container"><div className="cta-band"><div><h2>A better place to keep track.</h2><p>Create your account and make room for a clearer customer experience.</p></div><Link href="/signup" className="button">Get started with Brightloop <Icon name="arrow" size={16}/></Link></div></div></section>; }
export function MarketingHome() {
    return <PublicShell><main id="main-content">
        <section className="hero"><div className="site-container hero-grid">
            <div className="hero-copy"><p className="eyebrow">Subscription management, made clear</p>
                <h1>Every detail.<br />One clear picture.</h1>
                <p>Bring subscriptions, quotations and recurring billing into one shared workflow. Keep your business moving and your customers in the loop.</p>
                <div className="hero-actions"><Link href="/signup" className="button button-primary">Get started <Icon name="arrow" size={17} /></Link><Link href="/how-it-works" className="button button-secondary">See how it works <Icon name="chevron" size={15} /></Link></div>
                <div className="hero-note"><Icon name="shield" size={16} /><span>Verified account access. A workspace of your own.</span></div>
            </div><ProductPreview />
        </div></section>
        <section className="intro-strip"><div className="site-container"><p>For the business.<br /><strong>For the people it serves.</strong></p><div className="intro-items"><span><Icon name="repeat" />Subscriptions</span><span><Icon name="document" />Quotations</span><span><Icon name="wallet" />Billing</span><span><Icon name="shield" />Account access</span></div></div></section>
        <section className="public-section"><div className="site-container"><SectionTitle label="Everything stays connected" title="Less chasing. More understanding.">A place for the details that matter, from the proposed terms to the recorded receipt.</SectionTitle><FeatureCards /></div></section>
        <section className="public-section tinted"><div className="site-container split-section"><div><p className="eyebrow">A shared understanding</p><h2>Know what is agreed.<br />Know what comes next.</h2><p>Keep products, quotation terms and billing history in context, so every conversation starts in the right place.</p><ul className="check-list">{["Customer accounts with verified access", "Subscription and invoice details in context", "Help and account settings within reach"].map(text => <li key={text}><Icon name="check" size={17} />{text}</li>)}</ul><Link href="/how-it-works" className="text-link">Explore the workflow <Icon name="arrow" size={16} /></Link></div><WorkflowCard /></div></section>
        <section className="public-section"><div className="site-container pricing-summary"><SectionTitle label="Plans & pricing" title="The right terms start with your provider.">Prices and available plans come from the product catalog. Sample prices are never substituted for unavailable data.</SectionTitle><Link href="/pricing" className="button button-secondary">View plan availability <Icon name="arrow" size={16} /></Link></div></section>
        <section className="public-section tinted"><div className="site-container faq-section"><SectionTitle label="Useful answers" title="Before you get started." /><FAQ /></div></section><FinalCTA />
    </main></PublicShell>;
}
export function PublicIntro({ label, title, children }: {
    label: string;
    title: string;
    children: React.ReactNode;
}) { return <header className="site-container public-page-intro"><p className="eyebrow">{label}</p><h1>{title}</h1><p>{children}</p></header>; }
