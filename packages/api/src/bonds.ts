/** Years to maturity of retail bond series. */
export const BOND_TERM_YEARS: Record<string, number> = { EDO: 10 };

/** Series code = ticker + maturity month and two-digit year, e.g. EDO bought in Oct 2026 → EDO1036. */
export function bondSeries(ticker: string, purchaseDate: string): string {
  const years = BOND_TERM_YEARS[ticker];
  if (years === undefined) throw new Error(`Nieznany okres obligacji ${ticker}`);
  const month = purchaseDate.slice(5, 7);
  const year = String(Number(purchaseDate.slice(0, 4)) + years).slice(2);
  return `${ticker}${month}${year}`;
}
