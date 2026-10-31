"use client";
import { Icon } from "./icons";
export function PrintDocument({ label }: {
    label: string;
}) { return <button className="button button-secondary small no-print" type="button" onClick={() => window.print()}><Icon name="document" size={14}/>{label}</button>; }
