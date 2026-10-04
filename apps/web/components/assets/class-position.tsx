import type { RouterOutputs } from "@pip/api";
import { TrendingDown } from "lucide-react";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { WeightGauge } from "@/components/weight-gauge";
import { CLASSES } from "@/lib/classes";
import { formatBp, formatPln } from "@/lib/format";

type Overview = RouterOutputs["assets"]["overview"];

export function ClassPosition({
  overview,
  drawdownBp,
  extra,
}: {
  overview: Pick<Overview, "kind" | "name" | "targetWeightBp" | "position" | "queue">;
  drawdownBp?: number;
  extra?: React.ReactNode;
}) {
  const meta = CLASSES[overview.kind];
  const position = overview.position;
  const value = position?.valueMinor ?? 0n;
  return (
    <Card size="sm">
      <CardContent className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
        <div className="flex flex-col gap-3">
          <Stat label="Wartość pozycji" value={formatPln(value)} tone="hero" />
          {drawdownBp !== undefined && drawdownBp > 0 && (
            <Badge variant="secondary" className="gap-1.5 text-warning">
              <TrendingDown />
              Obsunięcie od szczytu {formatBp(drawdownBp)}
            </Badge>
          )}
        </div>
        <div className="flex flex-col gap-6">
          {position &&
          position.weightBp !== null &&
          position.effectiveTargetBp !== null &&
          position.band ? (
            <WeightGauge
              weightBp={position.weightBp}
              targetBp={position.effectiveTargetBp}
              band={position.band}
              colorClass={meta.bg}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Waga docelowa {formatBp(overview.targetWeightBp)}; pozycja jest na razie poza
              rebalancingiem.
            </p>
          )}
          {overview.queue.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Kolejka kont
              </span>
              <ol className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                {overview.queue.map((account, index) => (
                  <li key={account.id} className="flex items-baseline gap-2">
                    <span className="font-heading text-muted-foreground tabular-nums">
                      {index + 1}.
                    </span>
                    <span>
                      {account.name}
                      <span className="text-muted-foreground"> · {account.broker}</span>
                      {account.limit && (
                        <span className="text-muted-foreground tabular-nums">
                          {" "}
                          · {formatPln(account.limit.usedMinor)} /{" "}
                          {formatPln(account.limit.limitMinor)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {extra}
        </div>
      </CardContent>
    </Card>
  );
}
