import type { AssetClassKind } from "@pip/engine";
import { formatMoney, money, parseMoney } from "@pip/money";

const percentFormatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });
const percentFormatter2 = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

export function formatBp(bp: number, digits: 1 | 2 = 1): string {
  return `${(digits === 1 ? percentFormatter : percentFormatter2).format(bp / 100)}%`;
}

export function formatBand(band: { lowerBp: number; upperBp: number }): string {
  return `${percentFormatter.format(band.lowerBp / 100)}–${formatBp(band.upperBp)}`;
}

/** Share of `part` in `total`, in percent with two decimals; 0 when `total` is empty. */
export function percentOf(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  return Number((part * 10_000n) / total) / 100;
}

/** `null` for anything `parseMoney` rejects; the caller decides on the message. */
export function readMoney(raw: string): bigint | null {
  try {
    return parseMoney(raw);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof RangeError) return null;
    throw error;
  }
}

/** "7,5" → 750 bp; `null` when not a percentage with at most two decimals. */
export function readPercentBp(raw: string): number | null {
  const parsed = readMoney(raw);
  return parsed === null ? null : Number(parsed);
}

/** 750 bp → "7,5" for an editable field. */
export function bpToInput(bp: number): string {
  return moneyToInput(BigInt(bp));
}

/** Editable text for a stored amount, e.g. 1234567n → "12345,67" (no grouping, so it re-parses). */
export function moneyToInput(minor: bigint): string {
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(3, "0");
  const whole = digits.slice(0, -2);
  const fraction = digits.slice(-2);
  const text = fraction === "00" ? whole : `${whole},${fraction}`;
  return negative ? `-${text}` : text;
}

export const MONEY_FORMAT_HINT = "Podaj kwotę w złotych, np. 12 000 lub 12 000,50.";

export function formatPln(minor: bigint): string {
  return formatMoney(money(minor));
}

/** Signed correction of the monthly contribution: "+2000,00 zł", "−1500,00 zł", "0,00 zł". */
export function formatAdjustment(minor: bigint): string {
  if (minor < 0n) return `−${formatPln(-minor)}`;
  return minor > 0n ? `+${formatPln(minor)}` : formatPln(minor);
}

const dayMonthFormatter = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "numeric" });
const shortDateFormatter = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const monthYearFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
const axisMonthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit" });

/** `YYYY-MM-DD` → local Date at midnight (no timezone shift). */
export function isoToDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

export function formatIsoDate(iso: string): string {
  return shortDateFormatter.format(isoToDate(iso));
}

export function formatDayMonth(date: Date): string {
  return dayMonthFormatter.format(date);
}

export function formatAxisMonth(iso: string): string {
  return axisMonthFormatter.format(isoToDate(iso));
}

/** `YYYY-MM` → "Październik 2026". */
export function formatMonth(month: string): string {
  const text = monthYearFormatter.format(isoToDate(`${month}-01`));
  return text.charAt(0).toLocaleUpperCase("pl-PL") + text.slice(1);
}

export function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Whole days between an ISO date and today; `null` when there is no date. */
export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const ms = Date.now() - isoToDate(iso).getTime();
  return Math.floor(ms / 86_400_000);
}

export const CLASS_KIND_NAMES: Record<AssetClassKind, string> = {
  EQUITY: "Akcje",
  BONDS: "Obligacje",
  REAL_ESTATE: "Nieruchomości",
  GOLD: "Złoto",
};

export type SegmentTone = AssetClassKind | "CUSHION";

export const SEGMENT_BG: Record<SegmentTone, string> = {
  EQUITY: "bg-class-equity",
  BONDS: "bg-class-bonds",
  REAL_ESTATE: "bg-class-real-estate",
  GOLD: "bg-class-gold",
  CUSHION: "bg-class-cushion",
};

/** Decimal quantity string → Polish display: trailing zeros trimmed, comma separator. */
export function formatQuantity(quantity: string): string {
  const trimmed = quantity.includes(".") ? quantity.replace(/\.?0+$/, "") : quantity;
  return trimmed.replace(".", ",");
}
