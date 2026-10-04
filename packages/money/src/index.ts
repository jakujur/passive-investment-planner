export type Currency = "PLN" | "EUR" | "USD" | "GBP" | "CHF";

/** Amount in the smallest unit of its currency (grosze, cents). All supported currencies have 2 decimals. */
export interface Money {
  readonly minor: bigint;
  readonly currency: Currency;
}

export const BASE_CURRENCY: Currency = "PLN";

/** FX rates are stored as integers scaled by 10^6 (NBP publishes 4 decimals, the extra digits absorb cross rates). */
export const RATE_SCALE = 1_000_000n;

/** Basis points: 10 000 bp = 100%. */
export const BP_SCALE = 10_000n;

export function money(minor: bigint, currency: Currency = BASE_CURRENCY): Money {
  return { minor, currency };
}

/** Integer division rounded half away from zero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("Division by zero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (n * 2n + d) / (d * 2n);
  return negative ? -q : q;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function sumBig(values: readonly bigint[]): bigint {
  return values.reduce((acc, v) => acc + v, 0n);
}

/** `minor × bp / 10 000`, floored, so a share never exceeds what it was taken from. */
export function shareBp(minor: bigint, bp: number | bigint): bigint {
  return (minor * BigInt(bp)) / BP_SCALE;
}

/**
 * Splits `total` proportionally to `weights` with the largest-remainder method,
 * so the parts always sum exactly to `total`. Ties go to the earlier index.
 */
export function allocate(total: bigint, weights: readonly bigint[]): bigint[] {
  if (total < 0n) throw new RangeError("Cannot allocate a negative amount");
  const weightSum = sumBig(weights);
  if (weightSum === 0n) return weights.map(() => 0n);
  const parts = weights.map((w) => (total * w) / weightSum);
  let rest = total - sumBig(parts);
  const order = weights
    .map((w, i) => ({ i, remainder: (total * w) % weightSum }))
    .sort((a, b) => (a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1));
  for (const { i } of order) {
    if (rest === 0n) break;
    parts[i] = (parts[i] ?? 0n) + 1n;
    rest -= 1n;
  }
  return parts;
}

/** Account-currency amount → base currency, `rate` = base units per 1 unit of the foreign currency × 10^6. */
export function toBase(minor: bigint, rate: bigint): bigint {
  return divRound(minor * rate, RATE_SCALE);
}

export function fromBase(baseMinor: bigint, rate: bigint): bigint {
  return divRound(baseMinor * RATE_SCALE, rate);
}

export function parseRate(value: string): bigint {
  return parseDecimal(value, 6);
}

/** Parses user input like "1 234,56", "1234.5" or "-12" into minor units. */
export function parseMoney(value: string): bigint {
  return parseDecimal(value, 2);
}

function parseDecimal(value: string, digits: number): bigint {
  const normalized = value.replace(/[\s\u00a0]/g, "").replace(",", ".");
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(normalized);
  if (!match) throw new SyntaxError(`Not a decimal number: "${value}"`);
  const [, sign = "", whole = "0", fraction = ""] = match;
  if (fraction.length > digits) {
    throw new RangeError(`"${value}" has more than ${digits} decimal places`);
  }
  const scaled = BigInt(whole + fraction.padEnd(digits, "0"));
  return sign === "-" ? -scaled : scaled;
}

/** Exact decimal string of a minor amount, e.g. 123456n → "1234.56". */
export function toDecimalString(minor: bigint, digits = 2): string {
  const negative = minor < 0n;
  const digitsStr = (negative ? -minor : minor).toString().padStart(digits + 1, "0");
  const whole = digitsStr.slice(0, -digits);
  const fraction = digitsStr.slice(-digits);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

const formatters = new Map<Currency, Intl.NumberFormat>();

/** Polish formatting, e.g. "1 234,56 zł". Formats from the exact decimal string, never via `number`. */
export function formatMoney({ minor, currency }: Money): string {
  let formatter = formatters.get(currency);
  if (!formatter) {
    formatter = new Intl.NumberFormat("pl-PL", { style: "currency", currency });
    formatters.set(currency, formatter);
  }
  return formatter.format(toDecimalString(minor) as Intl.StringNumericLiteral);
}
