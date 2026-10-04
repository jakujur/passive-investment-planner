import type { Band } from "@pip/engine";
import { formatBand, formatBp } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Current weight against its target band on a 0 → scale axis. The band is a tinted span, the
 * target a hairline tick, the current weight a solid marker; outside the band the marker is amber.
 */
export function WeightGauge({
  weightBp,
  targetBp,
  band,
  colorClass,
  className,
}: {
  weightBp: number;
  targetBp: number;
  band: Band;
  colorClass: string;
  className?: string;
}) {
  const scaleBp = Math.max(1, Math.ceil(Math.max(band.upperBp * 1.4, weightBp * 1.15) / 500) * 500);
  const pct = (bp: number) => `${Math.min(100, (bp / scaleBp) * 100)}%`;
  const outside = weightBp < band.lowerBp || weightBp > band.upperBp;

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium tabular-nums">
          {formatBp(weightBp)}
          <span className="font-normal text-muted-foreground"> · cel {formatBp(targetBp)}</span>
        </span>
        <span
          className={cn("text-xs tabular-nums", outside ? "text-warning" : "text-muted-foreground")}
        >
          pasmo {formatBand(band)}
        </span>
      </div>
      <div aria-hidden className="relative h-2 w-full bg-muted">
        <div
          className={cn("absolute inset-y-0 opacity-30", colorClass)}
          style={{ left: pct(band.lowerBp), width: pct(band.upperBp - band.lowerBp) }}
        />
        <div className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: pct(targetBp) }} />
        <div
          className={cn(
            "absolute -inset-y-1 w-1 -translate-x-1/2",
            outside ? "bg-warning" : colorClass,
          )}
          style={{ left: pct(weightBp) }}
        />
      </div>
    </div>
  );
}
