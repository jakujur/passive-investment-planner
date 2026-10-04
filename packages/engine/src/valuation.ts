import { BP_SCALE, divRound, RATE_SCALE } from "@pip/money";

export const QUANTITY_DIGITS = 8;
const QUANTITY_SCALE = 10n ** BigInt(QUANTITY_DIGITS);

export interface PricePoint {
  /** `YYYY-MM-DD` */
  date: string;
  /** Close in the instrument currency. */
  closeMinor: bigint;
}

export interface FxPoint {
  date: string;
  /** Base currency per unit, scaled by RATE_SCALE. */
  rate: bigint;
}

export interface InstrumentQuotes {
  prices: readonly PricePoint[];
  /** `null` when the instrument is quoted in the base currency. */
  fx: readonly FxPoint[] | null;
}

export interface Purchase {
  date: string;
  instrumentId: string;
  /** Decimal string; `null` when bought by value without a known price. */
  quantity: string | null;
  /** What it cost in the base currency. */
  costMinor: bigint;
}

export interface ValuePoint {
  date: string;
  contributedMinor: bigint;
  valueMinor: bigint;
}

/** Latest point dated on or before `date`; `series` must be sorted ascending by date. */
export function asOf<T extends { date: string }>(
  series: readonly T[],
  date: string,
): T | undefined {
  let lo = 0;
  let hi = series.length - 1;
  let found: T | undefined;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const point = series[mid];
    if (point === undefined) break;
    if (point.date <= date) {
      found = point;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/** "12.5" → 1 250 000 000n (scaled by 10^8). */
export function parseQuantity(quantity: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(quantity.trim());
  if (!match) throw new SyntaxError(`Not a quantity: "${quantity}"`);
  const [, whole = "0", fraction = ""] = match;
  return BigInt(whole + fraction.slice(0, QUANTITY_DIGITS).padEnd(QUANTITY_DIGITS, "0"));
}

/**
 * Market value in the base currency of one purchase at `date`, or its cost when the
 * quantity or a quote is missing (a position bought by value keeps its cost until quoted).
 */
export function purchaseValueAt(
  purchase: Purchase,
  quotes: InstrumentQuotes | undefined,
  date: string,
): bigint {
  const price = quotes && asOf(quotes.prices, date);
  const rate = quotes?.fx === null ? RATE_SCALE : quotes && asOf(quotes.fx, date)?.rate;
  if (purchase.quantity === null || !price || rate === undefined) return purchase.costMinor;
  return divRound(
    parseQuantity(purchase.quantity) * price.closeMinor * rate,
    QUANTITY_SCALE * RATE_SCALE,
  );
}

/** Contributions and market value of a set of purchases at each of `dates`. */
export function valueSeries(
  purchases: readonly Purchase[],
  quotes: ReadonlyMap<string, InstrumentQuotes>,
  dates: readonly string[],
): ValuePoint[] {
  return dates.map((date) => {
    let contributedMinor = 0n;
    let valueMinor = 0n;
    for (const purchase of purchases) {
      if (purchase.date > date) continue;
      contributedMinor += purchase.costMinor;
      valueMinor += purchaseValueAt(purchase, quotes.get(purchase.instrumentId), date);
    }
    return { date, contributedMinor, valueMinor };
  });
}

/** Fall from the all-time high to the latest close, in basis points (0 at a new high). */
export function drawdownBp(prices: readonly PricePoint[]): number {
  const last = prices.at(-1);
  if (!last) return 0;
  const peak = prices.reduce((max, p) => (p.closeMinor > max ? p.closeMinor : max), 0n);
  if (peak === 0n) return 0;
  return Number(divRound((peak - last.closeMinor) * BP_SCALE, peak));
}
