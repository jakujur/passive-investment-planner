import type { RouterOutputs } from "@pip/api";
import { formatMoney, money } from "@pip/money";
import { AllocationStrip } from "@/components/allocation-strip";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatBp, percentOf } from "@/lib/format";

type Overview = RouterOutputs["household"]["overview"];
type Limit = Overview["summary"]["limits"][number];

const FAMILY_LABEL: Record<Limit["family"], string> = { IKE: "IKE", IKZE: "IKZE" };

export function Overview({ summary, year }: { summary: Overview["summary"]; year: number }) {
  const { cushion, classes, limits } = summary;
  const cushionPercent = percentOf(cushion.balanceMinor, cushion.targetMinor);
  const cushionFull = cushion.targetMinor > 0n && cushion.balanceMinor >= cushion.targetMinor;
  const portfolioTotal = classes.reduce((sum, item) => sum + item.valueMinor, 0n);

  const limitsByPerson = new Map<string, Limit[]>();
  for (const limit of limits) {
    const list = limitsByPerson.get(limit.personName) ?? [];
    list.push(limit);
    limitsByPerson.set(limit.personName, list);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Poduszka</CardTitle>
          <CardDescription>
            {cushionFull ? "Pełna — nadwyżka idzie dalej." : "Dopełniana przed inwestycjami."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Stat
            label="Stan"
            value={formatMoney(money(cushion.balanceMinor))}
            tone="hero"
            hint={
              cushion.targetMinor > 0n
                ? `z ${formatMoney(money(cushion.targetMinor))} celu`
                : "Cel: brak (0 miesięcy)"
            }
          />
          {cushion.targetMinor > 0n && (
            <Progress value={Math.min(100, cushionPercent)} aria-label="Wypełnienie poduszki">
              <span className="text-sm text-muted-foreground tabular-nums">
                {Math.round(cushionPercent)}%
              </span>
            </Progress>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Portfel</CardTitle>
          <CardDescription>
            {portfolioTotal > 0n
              ? `Razem ${formatMoney(money(portfolioTotal))}; obok każdej klasy waga docelowa.`
              : "Bez wyceny — obok każdej klasy waga docelowa."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AllocationStrip
            emptyCaption="Portfel jest pusty. Pierwsze zakupy pojawią się po pierwszym planie."
            segments={classes.map((item) => ({
              id: item.id,
              label: item.name,
              tone: item.kind,
              amountMinor: item.valueMinor,
              detail: `cel ${formatBp(item.targetWeightBp)}`,
            }))}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Limity {year}</CardTitle>
          <CardDescription>Roczne wpłaty na IKE i IKZE, osobno dla każdej osoby.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {limitsByPerson.size === 0 && (
            <p className="text-sm text-muted-foreground">Brak kont IKE i IKZE w tym układzie.</p>
          )}
          {[...limitsByPerson].map(([personName, personLimits]) => (
            <div key={personName} className="flex flex-col gap-4">
              {limitsByPerson.size > 1 && (
                <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {personName}
                </span>
              )}
              {personLimits.map((limit) => (
                <Progress
                  key={limit.accountId}
                  value={Math.min(100, percentOf(limit.usedMinor, limit.limitMinor))}
                  aria-label={`Wykorzystanie limitu ${FAMILY_LABEL[limit.family]}`}
                  className="gap-2"
                >
                  <Badge>{FAMILY_LABEL[limit.family]}</Badge>
                  <span className="ml-auto text-sm tabular-nums">
                    {formatMoney(money(limit.usedMinor))}
                    <span className="text-muted-foreground">
                      {" "}
                      / {formatMoney(money(limit.limitMinor))}
                    </span>
                  </span>
                </Progress>
              ))}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
