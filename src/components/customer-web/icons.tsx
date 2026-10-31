import type { CSSProperties } from "react";
const paths = {
    grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
    repeat: "M20 7H7a4 4 0 0 0-4 4 M17 3l4 4-4 4 M4 17h13a4 4 0 0 0 4-4 M7 13l-4 4 4 4",
    document: "M14 2H5v20h14V7z M14 2v6h5 M8 12h8 M8 16h8",
    wallet: "M3 6h17v15H3z M3 6V3h14 M15 12h6v5h-6z",
    help: "M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0",
    user: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 22v-2a8 8 0 0 1 16 0v2",
    settings: "M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M5 5l2 2 M17 17l2 2 M5 19l2-2 M17 7l2-2",
    arrow: "M4 12h16 M14 6l6 6-6 6",
    chevron: "M9 5l7 7-7 7",
    check: "M5 12l4 4L19 6",
    shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6z M8 12l3 3 5-6",
    clock: "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M12 6v6l4 2",
    search: "M15 15l6 6 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
    menu: "M3 6h18 M3 12h18 M3 18h18",
    close: "M6 6l12 12 M6 18L18 6",
    mail: "M2 4h20v16H2z M2 5l10 8L22 5",
    chart: "M4 3v18h18 M8 16v-4 M13 16V8 M18 16V5",
    layers: "M12 2L2 7l10 5 10-5z M2 12l10 5 10-5 M2 17l10 5 10-5",
    external: "M14 3h7v7 M10 14L21 3 M10 3H3v18h18v-7",
} as const;
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20, className, style }: {
    name: IconName;
    size?: number;
    className?: string;
    style?: CSSProperties;
}) {
    return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}><path d={paths[name]}/></svg>;
}
export function BrandMark() {
    return <span className="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M6 5h7a6 6 0 0 1 0 12H6V5Z" stroke="currentColor" strokeWidth="3"/><path d="M6 11h7a3 3 0 0 1 0 6" stroke="currentColor" strokeWidth="3"/></svg></span>;
}
