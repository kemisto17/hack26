import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";
export function PageHeader({ eyebrow, title, description, action }: {
    eyebrow?: string;
    title: string;
    description: string;
    action?: ReactNode;
}) {
    return <header className="page-heading"><div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1><p>{description}</p></div>{action}</header>;
}
export function Panel({ title, description, children, action, className = "" }: {
    title: string;
    description?: string;
    children: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}
export function EmptyState({ icon = "layers", title, description, unavailable = false }: {
    icon?: IconName;
    title: string;
    description: string;
    unavailable?: boolean;
}) {
    return <div className="empty-state" role={unavailable ? "status" : undefined}><span className="empty-icon"><Icon name={icon} size={25}/></span><h3>{title}</h3><p>{description}</p>{unavailable && <Link href="/portal/support" className="text-link">Get help <Icon name="arrow" size={15}/></Link>}</div>;
}
export function Badge({ children, tone = "neutral" }: {
    children: ReactNode;
    tone?: "neutral" | "green" | "blue" | "amber" | "red";
}) { return <span className={`badge badge-${tone}`}><span />{children}</span>; }
export function SectionTitle({ label, title, children }: {
    label: string;
    title: string;
    children?: ReactNode;
}) { return <div className="section-title"><span className="eyebrow">{label}</span><h2>{title}</h2>{children && <p>{children}</p>}</div>; }
export function LoadingView({ label = "Loading your account" }: {
    label?: string;
}) { return <div className="loading-view" role="status" aria-live="polite"><span className="loading-line"/><span className="loading-line short"/><div className="loading-cards">{[1, 2, 3].map(n => <span key={n}/>)}</div><p>{label}…</p></div>; }
export function Notice({ children }: {
    children: ReactNode;
}) { return <div className="notice"><Icon name="help" size={18}/><p>{children}</p></div>; }
export function FeedbackToast({ message, onDismiss }: {
    message: string;
    onDismiss: () => void;
}) { return <div className="feedback-toast" role="status" aria-live="polite"><Icon name="check" size={18}/><p>{message}</p><button type="button" aria-label="Dismiss notification" onClick={onDismiss}><Icon name="close" size={16}/></button></div>; }
