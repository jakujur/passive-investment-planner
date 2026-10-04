import type { RouterOutputs } from "@pip/api";
import { ArrowRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { AllocationStrip, type Segment } from "@/components/allocation-strip";
import { ExecuteDialog } from "@/components/execute-dialog";
import { PlanLedger } from "@/components/plan-ledger";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UndoMonthDialog } from "@/components/undo-month-dialog";
import { formatAdjustment, formatDayMonth, formatMonth, formatPln, percentOf } from "@/lib/format";

type Current = RouterOutputs["plan"]["current"];
type Cushion = RouterOutputs["household"]["overview"]["summary"]["cushion"];

function toSegments(current: Current): Segment[] {
  const byId = new Map<string, Segment>();
  const add = (id: string, label: string, tone: Segment["tone"], amountMinor: bigint) => {
    const existing = byId.get(id);
    if (existing) existing.amountMinor += amountMinor;
    else byId.set(id, { id, label, tone, amountMinor });
  };
  for (const item of current.plan.items) {
    switch (item.kind) {
      case "CUSHION":
        add("cushion", "Poduszka", "CUSHION", item.amountMinor);
        break;
      case "GOAL":
        add(
          "goal",
          `Cel: ${current.labels.goals[item.goalId].name}`,
          "REAL_ESTATE",
          item.amountMinor,
        );
        break;
      case "OVERPAYMENT":
        add("overpayment", "Nadpłata kredytu", "REAL_ESTATE", item.amountMinor);
        break;
      case "BUY": {
        const cls = current.labels.classes[item.classId];
        add(item.classId, cls.name, cls.kind, item.amountMinor);
        break;
      }
    }
  }
  return [...byId.values()];
}

/** The month beside the class cards: total, allocation, the transfers, the cushion and "Wykonane". */
export function PlanCard({ current, cushion }: { current: Current; cushion: Cushion }) {
  const done = current.status === "DONE";
  const toCushion = current.plan.items.reduce(
    (sum, item) => (item.kind === "CUSHION" ? sum + item.amountMinor : sum),
    0n,
  );
  const cushionPercent = percentOf(cushion.balanceMinor, cushion.targetMinor);
  const cushionFull = cushion.targetMinor > 0n && cushion.balanceMinor >= cushion.targetMinor;

  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardTitle>{formatMonth(current.month)}</CardTitle>
        <CardDescription>
          {done && current.executedAt
            ? `Zaksięgowany ${formatDayMonth(current.executedAt)}.`
            : current.monthlyContributionMinor === 0n
              ? "Miesięczna wpłata nie jest ustawiona."
              : "Plan czeka na wykonanie."}
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ustawienia planu"
            nativeButton={false}
            render={<Link href="/plan/ustawienia" />}
          >
            <Settings2 />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {done ? "Zaksięgowano" : "Do wpłaty w tym miesiącu"}
          </span>
          <span className="font-heading text-3xl leading-tight tabular-nums">
            {formatPln(current.surplusMinor)}
          </span>
          {current.adjustmentMinor !== 0n && (
            <span className="text-sm text-muted-foreground tabular-nums">
              {formatPln(current.monthlyContributionMinor)} stałej, korekta{" "}
              {formatAdjustment(current.adjustmentMinor)}
            </span>
          )}
        </div>

        <AllocationStrip
          segments={toSegments(current)}
          emptyCaption="Nic do rozpisania w tym miesiącu."
          legend={false}
        />

        <PlanLedger plan={current.plan} labels={current.labels} rationale={false} />

        <div className="mt-auto flex flex-col gap-1.5 border-t border-border pt-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Poduszka
            </span>
            <span className="text-sm tabular-nums">
              <span className="font-medium">{formatPln(cushion.balanceMinor)}</span>
              {cushion.targetMinor > 0n && (
                <span className="text-muted-foreground"> / {formatPln(cushion.targetMinor)}</span>
              )}
            </span>
          </div>
          {cushion.targetMinor > 0n ? (
            <Progress value={Math.min(100, cushionPercent)} aria-label="Wypełnienie poduszki">
              <span className="text-xs text-muted-foreground tabular-nums">
                {cushionFull
                  ? "pełna — wpłata idzie dalej"
                  : toCushion > 0n
                    ? `${Math.round(cushionPercent)}% · w tym planie +${formatPln(toCushion)}`
                    : `${Math.round(cushionPercent)}%`}
              </span>
            </Progress>
          ) : (
            <span className="text-xs text-muted-foreground">
              Bez celu (0 miesięcy) — wpłata idzie od razu do portfela.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {!done && (
            <ExecuteDialog
              month={current.month}
              amount={current.surplusMinor}
              adjustmentMinor={0n}
              disabled={current.surplusMinor === 0n}
              size="sm"
            />
          )}
          <Button
            variant={done ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href="/plan" />}
          >
            {done ? "Zobacz księgę" : "Zobacz plan"}
            <ArrowRight data-icon="inline-end" />
          </Button>
          {done && current.id !== null && (
            <UndoMonthDialog planId={current.id} month={current.month} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
