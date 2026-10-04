import type { ReactNode } from "react";
import { formatPln } from "@/lib/format";

const compactFormatter = new Intl.NumberFormat("pl-PL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Plot coordinate for a minor amount; only ever used for geometry, never for arithmetic. */
export function toPlotValue(minor: bigint): number {
  return Number(minor) / 100;
}

/** Axis ticks come back from the chart as floats, so they are the one place money is a number. */
export function formatAxisPln(tick: number): string {
  return `${compactFormatter.format(tick)} zł`;
}

export function ChartTooltipFrame({ title, rows }: { title: string; rows: ReactNode }) {
  return (
    <div className="min-w-44 border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-card">
      <div className="mb-1.5 font-semibold tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <dl className="flex flex-col gap-1">{rows}</dl>
    </div>
  );
}

export function TooltipRow({
  swatchClass,
  label,
  minor,
}: {
  swatchClass: string;
  label: string;
  minor: bigint;
}) {
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className={`size-2 shrink-0 ${swatchClass}`} />
      <dt className="flex-1 text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{formatPln(minor)}</dd>
    </div>
  );
}
