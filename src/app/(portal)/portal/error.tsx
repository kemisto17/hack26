"use client";
import Link from "next/link";
import { Icon } from "@/components/customer-web/icons";
export default function PortalError({ reset }: {
    reset: () => void;
}) { return <div className="empty-state"><span className="empty-icon"><Icon name="help" size={25}/></span><h1 style={{ fontSize: 20, fontWeight: 600 }}>We couldn’t load your workspace.</h1><p>Your account connection may be temporarily unavailable. Retry, or return to sign in.</p><div style={{ display: "flex", gap: 12, marginTop: 20 }}><button className="button button-primary" type="button" onClick={reset}>Try again</button><Link className="button button-secondary" href="/login">Back to sign in</Link></div></div>; }
