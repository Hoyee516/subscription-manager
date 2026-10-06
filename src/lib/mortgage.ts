// Mortgage bills: each instalment splits into interest and principal.
// The bank charges interest monthly on the balance left after the previous instalment:
// interest = previous balance × annual rate ÷ 12 (matches BEA statements to the cent).

/** A bill shows the mortgage fields when its category is "Mortgage" (any case). */
export const isMortgage = (category: string) => category.trim().toLowerCase() === "mortgage";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function splitInstalment(prevBalance: number, ratePct: number, instalment: number) {
  const interest = r2((prevBalance * ratePct) / 100 / 12);
  const principal = r2(instalment - interest);
  return { interest, principal, balance: r2(prevBalance - principal) };
}
