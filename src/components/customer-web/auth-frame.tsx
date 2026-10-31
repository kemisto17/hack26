"use client";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { Brand } from "./public-shell";
import { WorkflowCard } from "./marketing";
import { Icon } from "./icons";
export function AuthFrame({ children }: {
    children: ReactNode;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    function toggle() { const input = panel.current?.querySelector<HTMLInputElement>('input[name="password"]'); if (input) {
        input.type = visible ? "password" : "text";
        setVisible(!visible);
    } }
    return <div className="auth-frame"><aside className="auth-story"><Brand /><div className="auth-story-copy"><p className="eyebrow">Welcome to a clearer view</p><h2>Everything you need.<br />Right where it belongs.</h2><p>Your account is the starting point for a better view of your subscriptions and the details behind them.</p><WorkflowCard /></div><div className="auth-story-footer"><Icon name="shield" size={15}/> Account access powered by Supabase Auth</div></aside><div className="auth-panel" ref={panel}>{children}<button className="password-toggle" type="button" aria-pressed={visible} onClick={toggle}>{visible ? "Hide password" : "Show password"}</button><Link href="/" className="back-public"><Icon name="arrow" size={13} style={{ transform: "rotate(180deg)" }}/> Back to Brightloop</Link></div></div>;
}
