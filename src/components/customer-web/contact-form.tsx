"use client";
import { useState, type FormEvent } from "react";
import { Icon } from "./icons";
import { Notice, FeedbackToast } from "./ui";
export function ContactForm({ support = false }: {
    support?: boolean;
}) {
    const [message, setMessage] = useState("");
    const [draft, setDraft] = useState("");
    const [copying, setCopying] = useState(false);
    const [toast, setToast] = useState("");
    function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); const name = String(data.get("name") ?? "").trim(); const email = String(data.get("email") ?? "").trim(); const subject = String(data.get("subject") ?? "").trim(); const body = String(data.get("message") ?? "").trim(); if (!name || !subject || !body || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setMessage("Complete each field with a valid email and a message.");
        setDraft("");
        return;
    } setDraft(`Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${body}`); setMessage("Your message is ready to copy. It has not been sent; message delivery is not connected."); }
    async function copy() { setCopying(true); try {
        await navigator.clipboard.writeText(draft);
        setMessage("Message copied to your clipboard. It has not been sent.");
        setToast("Message copied. It has not been sent.");
    }
    catch {
        setMessage("Clipboard access was unavailable. Keep a copy of your message before leaving this page.");
    }
    finally {
        setCopying(false);
    } }
    return <div className="form-surface"><form className="web-form" onSubmit={submit}><h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-.4px" }}>{support ? "Prepare a support request" : "Let’s start a conversation"}</h2><Notice>Message delivery is not connected yet. You can prepare and copy your message here. Please do not include passwords or payment details.</Notice><div className="form-row"><label>Your name<input name="name" autoComplete="name" required maxLength={200} placeholder="Full name"/></label><label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="you@example.com"/></label></div><label>Subject<input name="subject" required maxLength={200} placeholder={support ? "What can we help you with?" : "How can we help?"}/></label><label>Your message<textarea name="message" required maxLength={5000} placeholder="Tell us a little more…"/><span className="field-help">Your message stays in this page until you choose to copy it.</span></label><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button className="button button-primary" type="submit">Prepare message <Icon name="arrow" size={14}/></button>{draft && <button className="button button-secondary" type="button" disabled={copying} onClick={() => { void copy(); }}>{copying ? "Copying…" : "Copy message"}</button>}</div><p className="form-feedback" role="status" aria-live="polite">{message}</p></form>{toast && <FeedbackToast message={toast} onDismiss={() => setToast("")}/>}</div>;
}
