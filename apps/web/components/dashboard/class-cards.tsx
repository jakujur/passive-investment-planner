import type { AssetClassKind, Band } from "@pip/engine";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { LimitBar } from "@/components/limit-bar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { WeightGauge } from "@/components/weight-gauge";
import { CLASSES, classPath } from "@/lib/classes";
import { formatBand, formatBp, formatPln } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface ClassFact {
  label: string;
  value: string;
  muted?: boolean;
}

export interface ClassCardModel {
  id: string;
  kind: AssetClassKind;
  name: string;
  valueMinor: bigint;
  /** What was paid in; `null` for real estate, where equity replaces it. */
  contributedMinor: bigint | null;
  weightBp: number | null;
  effectiveTargetBp: number | null;
  band: Band | null;
  targetWeightBp: number;
  toleranceRange: Band;
  plannedMinor: bigint;
  planDone: boolean;
  limits: {
    accountId: string;
    tag: string;
    person: string | null;
    usedMinor: bigint;
    limitMinor: bigint;
  }[];
  facts: ClassFact[];
}

export function ClassCards({ cards }: { cards: ClassCardModel[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {cards.map((card) => (
        <ClassCard key={card.id} card={card} />
      ))}
    </div>
  );
}

function ClassCard({ card }: { card: ClassCardModel }) {
  const meta = CLASSES[card.kind];
  const gain = card.contributedMinor === null ? null : card.valueMinor - card.contributedMinor;
  return (
    <Card size="sm" className="relative">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span aria-hidden className={cn("size-2.5", meta.bg)} />
          <Link
            href={classPath(card.kind)}
            className="outline-none after:absolute after:inset-0 hover:text-primary focus-visible:text-primary"
          >
            {card.name}
          </Link>
          <ArrowUpRight aria-hidden className="size-4 text-muted-foreground" />
        </CardTitle>
        <CardDescription>
          cel {formatBp(card.targetWeightBp)} · tolerancja {formatBand(card.toleranceRange)}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Wartość
            </span>
            <span
              className={cn(
                "font-heading text-2xl leading-tight tabular-nums",
                card.valueMinor === 0n && "text-muted-foreground",
              )}
            >
              {formatPln(card.valueMinor)}
            </span>
          </div>
          {card.contributedMinor !== null && gain !== null && (
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Wpłacono
              </span>
              <span className="text-base font-medium tabular-nums">
                {formatPln(card.contributedMinor)}
              </span>
              <span
                className={cn(
                  "text-xs tabular-nums",
                  gain > 0n && "text-primary",
                  gain < 0n && "text-destructive",
                  gain === 0n && "text-muted-foreground",
                )}
              >
                {gain > 0n ? "+" : ""}
                {formatPln(gain)} wyniku
              </span>
            </div>
          )}
        </div>

        {card.weightBp !== null && card.effectiveTargetBp !== null && card.band ? (
          <WeightGauge
            weightBp={card.weightBp}
            targetBp={card.effectiveTargetBp}
            band={card.band}
            colorClass={meta.bg}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            {card.kind === "REAL_ESTATE"
              ? "Poza rebalancingiem, dopóki żadne mieszkanie nie jest liczone do portfela."
              : "Bez udziału — portfel jest jeszcze pusty."}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 border-t border-border pt-3 text-sm">
          <div className="flex flex-col">
            <dt className="text-xs text-muted-foreground">
              {card.planDone ? "W tym miesiącu wpłacono" : "W tym miesiącu"}
            </dt>
            <dd
              className={cn(
                "font-medium tabular-nums",
                card.plannedMinor === 0n && "text-muted-foreground",
              )}
            >
              {formatPln(card.plannedMinor)}
            </dd>
          </div>
          {card.facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col">
              <dt className="text-xs text-muted-foreground">{fact.label}</dt>
              <dd
                className={cn("tabular-nums", fact.muted ? "text-muted-foreground" : "font-medium")}
              >
                {fact.value}
              </dd>
            </div>
          ))}
        </dl>

        {card.limits.length > 0 && (
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            {card.limits.map((limit) => (
              <LimitBar
                key={limit.accountId}
                tag={limit.tag}
                person={limit.person}
                usedMinor={limit.usedMinor}
                limitMinor={limit.limitMinor}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
