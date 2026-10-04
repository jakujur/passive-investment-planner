import { formatMoney, money } from "@pip/money";
import { percentOf, SEGMENT_BG, type SegmentTone } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface Segment {
  id: string;
  label: string;
  tone: SegmentTone;
  amountMinor: bigint;
  /** Shown next to the amount, e.g. the target weight. */
  detail?: string;
  /** Second line under the label, e.g. when a down payment will be complete. */
  note?: string;
}

export function AllocationStrip({
  segments,
  emptyCaption,
  legend = true,
  className,
}: {
  segments: Segment[];
  emptyCaption: string;
  legend?: boolean;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.amountMinor, 0n);
  const visible = segments.filter((segment) => segment.amountMinor > 0n);

  return (
    <div className={cn("@container flex flex-col gap-4", className)}>
      {total > 0n ? (
        <div aria-hidden className="flex h-3 w-full gap-px overflow-hidden bg-muted">
          {visible.map((segment) => (
            <div
              key={segment.id}
              className={SEGMENT_BG[segment.tone]}
              style={{ flexBasis: `${percentOf(segment.amountMinor, total)}%` }}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div aria-hidden className="hatched h-3 w-full" />
          <p className="text-sm text-muted-foreground">{emptyCaption}</p>
        </div>
      )}
      {legend && (
        <ul className="grid gap-x-8 gap-y-2 @lg:grid-cols-2">
          {segments.map((segment) => (
            <li key={segment.id} className="flex flex-col gap-0.5 text-sm">
              <div className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className={cn("mt-1 size-2.5 shrink-0 self-center", SEGMENT_BG[segment.tone])}
                />
                <span className="min-w-0 flex-1 truncate">{segment.label}</span>
                {segment.detail && (
                  <span className="text-muted-foreground tabular-nums">{segment.detail}</span>
                )}
                <span className="font-medium tabular-nums">
                  {formatMoney(money(segment.amountMinor))}
                </span>
              </div>
              {segment.note && (
                <span className="flex gap-2 text-xs text-muted-foreground">
                  <span aria-hidden className="size-2.5 shrink-0" />
                  <span>{segment.note}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
