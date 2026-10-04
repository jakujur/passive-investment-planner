import type { RouterOutputs } from "@pip/api";
import { Card, CardContent } from "@/components/ui/card";
import { formatBand, formatBp, formatPln } from "@/lib/format";
import { cn } from "@/lib/utils";

type Overview = RouterOutputs["assets"]["overview"];

export interface HeadFact {
  label: string;
  value: string;
  tone?: "default" | "muted" | "positive" | "negative" | "warning";
}

const TONE: Record<NonNullable<HeadFact["tone"]>, string> = {
  default: "font-medium",
  muted: "text-muted-foreground",
  positive: "font-medium text-primary",
  negative: "font-medium text-destructive",
  warning: "font-medium text-warning",
};

/** One-line class position: value, share against target and tolerance, plus class-specific facts. */
export function ClassHead({
  overview,
  facts = [],
}: {
  overview: Pick<Overview, "position" | "targetWeightBp">;
  facts?: HeadFact[];
}) {
  const position = overview.position;
  const value = position?.valueMinor ?? 0n;
  const inPortfolio =
    position !== null &&
    position.weightBp !== null &&
    position.effectiveTargetBp !== null &&
    position.band !== null;
  const outside =
    inPortfolio &&
    position.band !== null &&
    position.weightBp !== null &&
    (position.weightBp < position.band.lowerBp || position.weightBp > position.band.upperBp);

  return (
    <Card size="sm">
      <CardContent>
        <dl className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="flex flex-col">
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Wartość
            </dt>
            <dd
              className={cn(
                "font-heading text-3xl leading-tight tabular-nums",
                value === 0n && "text-muted-foreground",
              )}
            >
              {formatPln(value)}
            </dd>
          </div>
          <div className="flex flex-col">
            <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Udział
            </dt>
            <dd className="text-sm tabular-nums">
              {inPortfolio && position.weightBp !== null && position.band !== null ? (
                <>
                  <span className={cn("font-medium", outside && "text-warning")}>
                    {formatBp(position.weightBp)}
                  </span>
                  <span className="text-muted-foreground">
                    {" "}
                    · cel {formatBp(position.effectiveTargetBp ?? overview.targetWeightBp)} ·{" "}
                    {outside ? "poza tolerancją" : "tolerancja"} {formatBand(position.band)}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  cel {formatBp(overview.targetWeightBp)} · na razie poza rebalancingiem
                </span>
              )}
            </dd>
          </div>
          {facts.map((fact) => (
            <div key={fact.label} className="flex flex-col">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {fact.label}
              </dt>
              <dd className={cn("text-sm tabular-nums", TONE[fact.tone ?? "default"])}>
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
