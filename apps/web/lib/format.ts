import type { AssetClassKind } from "@pip/engine";
import { parseMoney } from "@pip/money";

const percentFormatter = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 });

export function formatBp(bp: number): string {
  return `${percentFormatter.format(bp / 100)}%`;
}

export function formatBand(band: { lowerBp: number; upperBp: number }): string {
  return `${percentFormatter.format(band.lowerBp / 100)}–${formatBp(band.upperBp)}`;
}

/** Share of `part` in `total`, in whole percent; 0 when `total` is empty. */
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

export const MONEY_FORMAT_HINT = "Podaj kwotę w złotych, np. 12 000 lub 12 000,50.";

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
