import type { RouterOutputs } from "@pip/api";
import { ArrowRight, Settings2 } from "lucide-react";
import Link from "next/link";
import { AllocationStrip } from "@/components/allocation-strip";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
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
import { WeightGauge } from "@/components/weight-gauge";
import { CLASS_ORDER, CLASSES, classPath, classSettingsPath } from "@/lib/classes";
import { formatBp, formatDayMonth, formatMonth, formatPln, percentOf } from "@/lib/format";

type Summary = RouterOutputs["household"]["overview"]["summary"];
type ClassSummary = Summary["classes"][number];
type Limit = Summary["limits"][number];
type PlanStatus = RouterOutputs["plan"]["current"];

export function PortfolioHero({ classes }: { classes: ClassSummary[] }) {
  const total = classes.reduce((sum, c) => sum + c.valueMinor, 0n);
  const ordered = CLASS_ORDER.flatMap((kind) => classes.filter((c) => c.kind === kind));
  return (
    <Card>
      <CardContent className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
        <Stat label="Majątek inwestycyjny" value={formatPln(total)} tone="hero" />
        <AllocationStrip
          emptyCaption="Portfel jest pusty — legenda pokazuje wagi docelowe."
          segments={ordered.map((c) => ({
            id: c.id,
            label: c.name,
            tone: c.kind,
            amountMinor: c.valueMinor,
            detail:
              total > 0n && c.weightBp !== null
                ? formatBp(c.weightBp)
                : `cel ${formatBp(c.targetWeightBp)}`,
          }))}
        />
      </CardContent>
    </Card>
  );
}

export function ClassCards({ classes }: { classes: ClassSummary[] }) {
  const ordered = CLASS_ORDER.flatMap((kind) => classes.filter((c) => c.kind === kind));
  return (
    <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
      {ordered.map((c) => {
        const meta = CLASSES[c.kind];
        return (
          <Card key={c.id} size="sm" className="relative">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span aria-hidden className={`size-2.5 ${meta.bg}`} />
                <Link
                  href={classPath(c.kind)}
                  className="outline-none after:absolute after:inset-0 hover:text-primary focus-visible:text-primary"
                >
                  {c.name}
                </Link>
              </CardTitle>
              <CardDescription>cel {formatBp(c.targetWeightBp)} portfela</CardDescription>
              <CardAction className="relative z-10">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Ustawienia: ${c.name}`}
                  nativeButton={false}
                  render={<Link href={classSettingsPath(c.kind)} />}
                >
                  <Settings2 />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Stat
                label="Wartość"
                value={formatPln(c.valueMinor)}
                tone={c.valueMinor > 0n ? "default" : "muted"}
              />
              {c.weightBp !== null && c.effectiveTargetBp !== null && c.band ? (
                <WeightGauge
                  weightBp={c.weightBp}
                  targetBp={c.effectiveTargetBp}
                  band={c.band}
                  colorClass={meta.bg}
                />
              ) : (
                <p className="text-sm text-muted-foreground">
                  {c.kind === "REAL_ESTATE"
                    ? "Poza rebalancingiem, dopóki żadne mieszkanie nie jest liczone do portfela."
                    : "Bez wagi — portfel jest jeszcze pusty."}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function CushionCard({ cushion }: { cushion: Summary["cushion"] }) {
  const percent = percentOf(cushion.balanceMinor, cushion.targetMinor);
  const full = cushion.targetMinor > 0n && cushion.balanceMinor >= cushion.targetMinor;
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Poduszka</CardTitle>
        <CardDescription>
          {full ? "Pełna — wpłata idzie dalej." : "Dopełniana przed inwestycjami."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Stat
          label="Stan"
          value={formatPln(cushion.balanceMinor)}
          tone="hero"
          hint={
            cushion.targetMinor > 0n
              ? `z ${formatPln(cushion.targetMinor)} celu`
              : "Cel: brak (0 miesięcy)"
          }
        />
        {cushion.targetMinor > 0n && (
          <Progress value={Math.min(100, percent)} aria-label="Wypełnienie poduszki">
            <span className="text-sm text-muted-foreground tabular-nums">
              {Math.round(percent)}%
            </span>
          </Progress>
        )}
      </CardContent>
    </Card>
  );
}

export function LimitsCard({ limits, year }: { limits: Limit[]; year: number }) {
  const byPerson = new Map<string, Limit[]>();
  for (const limit of limits) {
    const list = byPerson.get(limit.personName) ?? [];
    list.push(limit);
    byPerson.set(limit.personName, list);
  }
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Limity {year}</CardTitle>
        <CardDescription>Roczne wpłaty na IKE i IKZE, osobno dla każdej osoby.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {byPerson.size === 0 && (
          <p className="text-sm text-muted-foreground">Brak kont IKE i IKZE w tym układzie.</p>
        )}
        {[...byPerson].map(([personName, personLimits]) => (
          <div key={personName} className="flex flex-col gap-4">
            {byPerson.size > 1 && (
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {personName}
              </span>
            )}
            {personLimits.map((limit) => (
              <Progress
                key={limit.accountId}
                value={Math.min(100, percentOf(limit.usedMinor, limit.limitMinor))}
                aria-label={`Wykorzystanie limitu ${limit.family}`}
                className="gap-2"
              >
                <Badge>{limit.family}</Badge>
                <span className="ml-auto text-sm tabular-nums">
                  {formatPln(limit.usedMinor)}
                  <span className="text-muted-foreground"> / {formatPln(limit.limitMinor)}</span>
                </span>
              </Progress>
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function PlanStatusCard({ current }: { current: PlanStatus }) {
  const total = current.plan.items.reduce((sum, item) => sum + item.amountMinor, 0n);
  const done = current.status === "DONE";
  return (
    <Card size="sm" className="relative">
      <CardHeader>
        <CardTitle>{formatMonth(current.month)}</CardTitle>
        <CardDescription>
          {done && current.executedAt
            ? `Zaksięgowany ${formatDayMonth(current.executedAt)}.`
            : current.monthlyContributionMinor === 0n
              ? "Miesięczna wpłata nie jest ustawiona."
              : "Plan czeka na wykonanie."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <Stat
          label={done ? "Zaksięgowano" : "Do wpłaty w tym miesiącu"}
          value={formatPln(total)}
          tone={total > 0n ? "default" : "muted"}
          hint={
            current.extraMinor > 0n
              ? `w tym ${formatPln(current.extraMinor)} dodatkowo`
              : `${current.plan.items.length} przelew${plural(current.plan.items.length)}`
          }
        />
        <Button
          variant={done ? "outline" : "default"}
          size="sm"
          className="self-start"
          nativeButton={false}
          render={<Link href="/plan" />}
        >
          {done ? "Zobacz księgę" : "Zobacz plan"}
          <ArrowRight data-icon="inline-end" />
        </Button>
      </CardContent>
    </Card>
  );
}

function plural(n: number): string {
  if (n === 1) return "";
  const last = n % 10;
  const tens = n % 100;
  if (last >= 2 && last <= 4 && (tens < 12 || tens > 14)) return "y";
  return "ów";
}
