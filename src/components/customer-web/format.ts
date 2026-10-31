export function amount(minor: string, currency: string) {
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    const divisor = BigInt(10) ** BigInt(digits);
    const value = BigInt(minor);
    return formatter.formatToParts(value / divisor).map(part => part.type === "fraction" ? (value % divisor).toString().padStart(digits, "0") : part.value).join("");
}
export function date(value: string | null | undefined) { if (!value)
    return "Not scheduled"; return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value)); }
export function validResourceId(id: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id); }
