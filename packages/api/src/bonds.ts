/** Term of Polish retail treasury bonds in months; the series code carries the maturity month. */
export const BOND_TERM_MONTHS = {
  OTS: 3,
  ROR: 12,
  DOR: 24,
  TOS: 36,
  COI: 48,
  ROS: 72,
  EDO: 120,
  ROD: 144,
} as const;

export type BondTicker = keyof typeof BOND_TERM_MONTHS;

/** Retail bonds are sold at a 100 zł nominal. */
export const BOND_NOMINAL_MINOR = 10_000n;

export const BOND_NAMES: Record<BondTicker, string> = {
  OTS: "Obligacje 3-miesięczne OTS",
  ROR: "Obligacje roczne ROR",
  DOR: "Obligacje 2-letnie DOR",
  TOS: "Obligacje 3-letnie TOS",
  COI: "Obligacje 4-letnie COI",
  ROS: "Obligacje rodzinne 6-letnie ROS",
  EDO: "Obligacje 10-letnie EDO",
  ROD: "Obligacje rodzinne 12-letnie ROD",
};

export function bondTermLabel(ticker: BondTicker): string {
  const months = BOND_TERM_MONTHS[ticker];
  if (months < 12) return `${months} mies.`;
  const years = months / 12;
  return `${years} ${years === 1 ? "rok" : years < 5 ? "lata" : "lat"}`;
}

export function isBondTicker(ticker: string): ticker is BondTicker {
  return ticker in BOND_TERM_MONTHS;
}

function shiftMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d.toISOString().slice(0, 10);
}

/** Bonds are redeemed on the same day of the month they were bought, `term` months later. */
export function bondMaturityDate(ticker: BondTicker, purchaseDate: string): string {
  return shiftMonths(purchaseDate, BOND_TERM_MONTHS[ticker]);
}

export function bondPurchaseDate(ticker: BondTicker, maturityDate: string): string {
  return shiftMonths(maturityDate, -BOND_TERM_MONTHS[ticker]);
}

/** Series code = ticker + maturity month and two-digit year, e.g. EDO bought in Oct 2026 → EDO1036. */
export function bondSeries(ticker: string, purchaseDate: string): string {
  if (!isBondTicker(ticker)) throw new Error(`Nieznany typ obligacji ${ticker}`);
  const maturity = bondMaturityDate(ticker, purchaseDate);
  return `${ticker}${maturity.slice(5, 7)}${maturity.slice(2, 4)}`;
}

/** „ROD0338” → ROD maturing in March 2038; `null` for anything that is not a retail series code. */
export function parseBondSeries(
  code: string,
): { ticker: BondTicker; maturityMonth: string } | null {
  const match = /^([A-Z]{3})(0[1-9]|1[0-2])(\d{2})$/.exec(code.trim().toUpperCase());
  if (!match) return null;
  const [, ticker = "", month = "", year = ""] = match;
  if (!isBondTicker(ticker)) return null;
  return { ticker, maturityMonth: `20${year}-${month}` };
}

/** Maturity date of a lot from its series ticker and purchase date. */
export function lotMaturityDate(series: string, purchaseDate: string): string {
  const ticker = series.replace(/\d+$/, "");
  return isBondTicker(ticker) ? bondMaturityDate(ticker, purchaseDate) : purchaseDate;
}
