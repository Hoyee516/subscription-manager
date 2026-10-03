// HKD conversion for display. Same source as rebate-app (frankfurter.app),
// cached by Next.js for a day so it's fetched at most once daily.

const PEG_FALLBACK: Record<string, number> = { USD: 7.8 }; // HKD is pegged to USD (7.75–7.85)

async function rateToHkd(currency: string): Promise<number | null> {
  if (currency === "HKD") return 1;
  try {
    const res = await fetch(`https://api.frankfurter.app/latest?from=${currency}&to=HKD`, {
      next: { revalidate: 86_400 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { rates?: { HKD?: number } };
    if (data.rates?.HKD) return data.rates.HKD;
    throw new Error("No HKD rate in response");
  } catch (e) {
    console.error(`[fx] ${currency}→HKD lookup failed, using fallback:`, e);
    return PEG_FALLBACK[currency] ?? null;
  }
}

/** Loads rates for the given currencies once per request. */
export async function loadRates(currencies: Iterable<string>): Promise<Map<string, number | null>> {
  const unique = [...new Set(currencies)];
  const rates = await Promise.all(unique.map(rateToHkd));
  return new Map(unique.map((c, i) => [c, rates[i]]));
}

/**
 * HKD figure for a term amount: the vendor's quoted HKD amount if recorded,
 * otherwise converted at today's rate (approx = true).
 */
export function toHkd(
  amount: number,
  currency: string,
  quotedHkd: number | null,
  rates: Map<string, number | null>
): { hkd: number | null; approx: boolean } {
  if (currency === "HKD") return { hkd: amount, approx: false };
  if (quotedHkd !== null) return { hkd: quotedHkd, approx: false };
  const r = rates.get(currency);
  return r ? { hkd: Math.round(amount * r * 100) / 100, approx: true } : { hkd: null, approx: false };
}
