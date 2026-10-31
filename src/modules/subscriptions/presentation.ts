/** Format API minor-unit strings without converting money to floating point. */
export function formatMoney(minor: string, currency: string): string {
  const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const divisor = BigInt(10) ** BigInt(digits);
  const amount = BigInt(minor);
  const fraction = (amount % divisor).toString().padStart(digits, "0");
  return formatter.formatToParts(amount / divisor).map(part => part.type === "fraction" ? fraction : part.value).join("");
}
