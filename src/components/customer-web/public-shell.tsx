"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BrandMark, Icon } from "./icons";
export const publicLinks = [["Home", "/"], ["Features", "/features"], ["How it works", "/how-it-works"], ["Pricing", "/pricing"], ["About", "/about"], ["Contact", "/contact"]] as const;
export function Brand({ href = "/" }: {
    href?: string;
}) { return <Link href={href} className="brand"><BrandMark /><span>brightloop<span className="brand-dot">.</span></span></Link>; }
export function PublicShell({ children }: {
    children: ReactNode;
}) {
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    return <div className="public-site"><a className="skip-link" href="#main-content">Skip to content</a><header className="public-header"><div className="site-container nav-row"><Brand /><button className="icon-button mobile-menu" type="button" aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="public-navigation" onClick={() => setOpen(!open)}><Icon name={open ? "close" : "menu"}/></button><nav id="public-navigation" className={`public-nav ${open ? "is-open" : ""}`} aria-label="Public navigation">{publicLinks.map(([label, href]) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link>)}<div className="nav-actions"><Link href="/login" className="login-link">Log in</Link><Link href="/signup" className="button button-dark small">Get started <Icon name="arrow" size={15}/></Link></div></nav></div></header>{children}<footer className="public-footer"><div className="site-container footer-grid"><div><Brand /><p>Every subscription.<br />A little more clarity.</p><span className="footer-caption">Built for the full customer journey.</span></div><div><h2>Explore</h2><Link href="/features">Features</Link><Link href="/how-it-works">How it works</Link><Link href="/pricing">Pricing</Link></div><div><h2>Company</h2><Link href="/about">About Brightloop</Link><Link href="/contact">Contact</Link><Link href="/portal/support">Help & support</Link></div><div><h2>Your account</h2><Link href="/login">Sign in</Link><Link href="/signup">Create an account</Link><Link href="/portal/dashboard">Customer portal</Link></div></div><div className="site-container footer-bottom"><span>Brightloop · HACK26</span><div><Link href="/privacy">Privacy notice</Link><Link href="/terms">Terms information</Link><span className="system-label"><i /> Account access available</span></div></div></footer></div>;
}
