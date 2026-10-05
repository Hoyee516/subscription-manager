// HKD conversion for display. Fixed rates instead of a live lookup: HKD is pegged to
// USD (7.75–7.85); GBP is the market rate on 5 Oct 2026 (10.366), rounded.
// Manually entered HKD amounts always win.

const RATE_TO_HKD: Record<string, number> = { HKD: 1, USD: 7.8, GBP: 10.37 };

/**
 * HKD figure for a term amount: the vendor's quoted HKD amount if recorded,
 * otherwise converted at the fixed rate (approx = true).
 */
export function toHkd(amount: number, currency: string, quotedHkd: number | null): { hkd: number | null; approx: boolean } {
  if (currency === "HKD") return { hkd: amount, approx: false };
  if (quotedHkd !== null) return { hkd: quotedHkd, approx: false };
  const r = RATE_TO_HKD[currency];
  return r ? { hkd: Math.round(amount * r * 100) / 100, approx: true } : { hkd: null, approx: false };
}
