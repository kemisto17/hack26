"use client";
import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { UserDTO } from "@/modules/identity/contracts";
import { SignOut } from "@/modules/identity/sign-out";
import { Brand } from "./public-shell";
import { Icon, type IconName } from "./icons";
export const portalLinks: {
    label: string;
    href: string;
    icon: IconName;
}[] = [
    { label: "Overview", href: "/portal/dashboard", icon: "grid" }, { label: "My subscriptions", href: "/portal/subscriptions", icon: "repeat" }, { label: "Quotations", href: "/portal/quotations", icon: "document" }, { label: "Invoices", href: "/portal/invoices", icon: "layers" }, { label: "Payments", href: "/portal/payments", icon: "wallet" }, { label: "Help & support", href: "/portal/support", icon: "help" }, { label: "Profile & settings", href: "/portal/profile", icon: "settings" },
];
export function PortalShell({ user, children }: {
    user: UserDTO;
    children: ReactNode;
}) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [collapsed, setCollapsed] = useState(false);
    const current = portalLinks.find(link => pathname.startsWith(link.href))?.label ?? (pathname === "/portal/settings" ? "Account settings" : "Overview");
    return <div className={`portal-app ${collapsed ? "sidebar-collapsed" : ""}`}><a className="skip-link" href="#main-content">Skip to content</a>{open && <button type="button" className="sidebar-backdrop" aria-label="Close navigation" onClick={() => setOpen(false)}/>}<aside id="portal-sidebar" className={`portal-sidebar ${open ? "is-open" : ""}`}><Brand href="/portal/dashboard"/><p className="sidebar-caption">CUSTOMER WORKSPACE</p><nav aria-label="Customer navigation">{portalLinks.map(link => <Link key={link.href} href={link.href} title={collapsed ? link.label : undefined} prefetch={false} className={pathname.startsWith(link.href) || (link.href === "/portal/profile" && pathname === "/portal/settings") ? "active" : ""} aria-current={pathname.startsWith(link.href) || (link.href === "/portal/profile" && pathname === "/portal/settings") ? "page" : undefined} onClick={() => setOpen(false)}><Icon name={link.icon}/><span>{link.label}</span></Link>)}</nav><div className="sidebar-bottom"><div className="sidebar-help"><Icon name="help"/><h3>A little help?</h3><p>Find answers and your next step.</p><Link href="/portal/support">Visit support <Icon name="arrow" size={14}/></Link></div><div className="sidebar-profile"><span className="avatar">{user.display_name.slice(0, 1).toUpperCase() || "C"}</span><div><strong>{user.display_name || "Your account"}</strong><span>Customer account</span></div><button className="icon-button desktop-collapse" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed(!collapsed)}><Icon name="chevron" size={16}/></button></div></div></aside><div className="portal-body"><header className="portal-topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" type="button" aria-label="Open customer navigation" aria-expanded={open} aria-controls="portal-sidebar" onClick={() => setOpen(!open)}><Icon name="menu"/></button><span>Workspace</span><Icon name="chevron" size={13}/><strong>{current}</strong></div><div className="topbar-actions"><Link href="/portal/support" className="topbar-help">Need help?</Link><details className="header-dropdown"><summary aria-label="Notifications"><Icon name="bell"/></summary><div className="dropdown-surface"><h3>Notifications</h3><p>There is no connected notification feed yet. Check your subscriptions and invoices for updates.</p></div></details><details className="header-dropdown"><summary aria-label="Account menu"><span className="avatar small">{user.display_name.slice(0, 1).toUpperCase() || "C"}</span></summary><div className="dropdown-surface account-dropdown"><strong>{user.display_name || "Your account"}</strong><Link href="/portal/profile">Your profile</Link><Link href="/portal/settings">Account settings</Link><SignOut /></div></details></div></header><main id="main-content" className="portal-main">{children}<footer className="portal-footer"><span>Brightloop customer workspace</span><Link href="/portal/support">We’re here to help <Icon name="external" size={12}/></Link></footer></main></div></div>;
}
