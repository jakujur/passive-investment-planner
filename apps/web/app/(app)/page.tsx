import type { RouterOutputs } from "@pip/api";
import { AllocationStrip } from "@/components/allocation-strip";
import {
  type ClassCardModel,
  ClassCards,
  type ClassFact,
} from "@/components/dashboard/class-cards";
import { PlanCard } from "@/components/dashboard/plan-card";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { CLASS_ORDER, wrapperTag } from "@/lib/classes";
import { formatBp, formatIsoDate, formatMonth, formatPln, percentOf, todayIso } from "@/lib/format";
import { requireHousehold, serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function DashboardPage() {
  const { membership } = await requireHousehold();
  const api = await serverApi();
  const [{ summary, insights, goalForecast }, current, settings, bonds, realEstate] =
    await Promise.all([
      api.household.overview(),
      api.plan.current({ adjustmentMinor: 0n }),
      api.settings.get(),
      api.assets.overview({ kind: "BONDS" }),
      api.assets.overview({ kind: "REAL_ESTATE" }),
    ]);
  const today = todayIso();
  const showPerson = settings.persons.length > 1;
  const total = summary.classes.reduce((sum, c) => sum + c.valueMinor, 0n);
  const contributed = Object.values(insights).reduce((sum, i) => sum + i.contributedMinor, 0n);
  // Real estate counts as equity, not as paid-in capital, so the result covers securities only.
  const invested = summary.classes
    .filter((c) => c.kind !== "REAL_ESTATE")
    .reduce((sum, c) => sum + c.valueMinor, 0n);
  const gain = invested - contributed;

  const cards: ClassCardModel[] = CLASS_ORDER.flatMap((kind) => {
    const c = summary.classes.find((x) => x.kind === kind);
    const setting = settings.classes.find((x) => x.kind === kind);
    if (!c || !setting) return [];
    const insight = insights[c.id];
    const facts: ClassFact[] = [];

    if (kind === "EQUITY" || kind === "GOLD") {
      facts.push({
        label: "Instrument",
        value: insight?.instrumentName ?? "nie ustawiono",
        muted: !insight?.instrumentName,
      });
      facts.push({
        label: "Ostatnie notowanie",
        value: insight?.lastQuote
          ? `${formatIsoDate(insight.lastQuote.date)} · ${formatPln(insight.lastQuote.priceMinor)}`
          : "brak",
        muted: !insight?.lastQuote,
      });
    }
    if (kind === "BONDS" && bonds.kind === "BONDS") {
      const next = bonds.lots.filter((lot) => lot.maturityDate >= today)[0];
      facts.push({
        label: "Najbliższy wykup",
        value: next
          ? `${formatIsoDate(next.maturityDate)} · ${formatPln(next.nominalMinor)}`
          : "brak serii",
        muted: !next,
      });
      facts.push({
        label: "Instrument",
        value: insight?.instrumentName ?? "nie ustawiono",
        muted: !insight?.instrumentName,
      });
    }
    if (kind === "REAL_ESTATE" && realEstate.kind === "REAL_ESTATE") {
      const ltvBp =
        realEstate.totals.valueMinor > 0n
          ? Number((realEstate.totals.debtMinor * 10_000n) / realEstate.totals.valueMinor)
          : null;
      facts.push({
        label: "Kapitał własny",
        value: formatPln(realEstate.totals.equityMinor),
        muted: realEstate.totals.equityMinor === 0n,
      });
      facts.push({
        label: "LTV",
        value: ltvBp === null ? "bez mieszkań" : formatBp(ltvBp),
        muted: ltvBp === null,
      });
      const goal = realEstate.goals.find((g) => g.funded);
      facts.push({
        label: "Odkładam",
        value: goal
          ? `${Math.round(percentOf(goal.savedMinor, goal.targetMinor))}% · ${formatPln(goal.savedMinor)} z ${formatPln(goal.targetMinor)}`
          : "bez celu",
        muted: !goal,
      });
    }

    return [
      {
        id: c.id,
        kind,
        name: c.name,
        valueMinor: c.valueMinor,
        contributedMinor: kind === "REAL_ESTATE" ? null : (insight?.contributedMinor ?? 0n),
        weightBp: c.weightBp,
        effectiveTargetBp: c.effectiveTargetBp,
        band: c.band,
        targetWeightBp: setting.targetWeightBp,
        toleranceRange: setting.range,
        plannedMinor: current.plan.allocation[c.id] ?? 0n,
        planDone: current.status === "DONE",
        limits: summary.limits
          .filter((limit) => limit.assetKind === kind)
          .map((limit) => ({
            accountId: limit.accountId,
            tag: wrapperTag(limit.family, limit.ikzeEntrepreneur),
            person: showPerson ? limit.personName : null,
            usedMinor: limit.usedMinor,
            limitMinor: limit.limitMinor,
          })),
        facts,
      },
    ];
  });

  return (
    <>
      <PageHeader
        eyebrow="Pulpit"
        title={membership.householdName}
        lead={`${formatMonth(current.month)} — majątek, klasy aktywów i plan miesiąca.`}
      />
      <Card size="sm">
        <CardContent className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:gap-10">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Majątek inwestycyjny
              </span>
              <span className="font-heading text-4xl leading-[1.1] tabular-nums">
                {formatPln(total)}
              </span>
            </div>
            <span className="text-sm text-muted-foreground tabular-nums">
              wpłacono {formatPln(contributed)} ·{" "}
              <span
                className={cn(
                  gain > 0n && "text-primary",
                  gain < 0n && "text-destructive",
                  gain === 0n && "text-muted-foreground",
                )}
              >
                {gain > 0n ? "+" : ""}
                {formatPln(gain)} wyniku
              </span>
            </span>
          </div>
          <AllocationStrip
            emptyCaption="Portfel jest pusty — legenda pokazuje wagi docelowe."
            className="gap-3"
            segments={cards.map((c) => ({
              id: c.id,
              label: c.name,
              tone: c.kind,
              amountMinor: c.valueMinor,
              detail:
                total > 0n && c.weightBp !== null
                  ? formatBp(c.weightBp)
                  : `cel ${formatBp(c.targetWeightBp)}`,
              ...(c.kind === "REAL_ESTATE" && goalForecast ? { note: goalNote(goalForecast) } : {}),
            }))}
          />
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="order-last lg:order-none">
          <ClassCards cards={cards} />
        </div>
        <PlanCard current={current} cushion={summary.cushion} />
      </div>
    </>
  );
}

/** „(cel „Ochota”: 14 mies. · luty 2028)” — when the goal the plan funds is complete. */
function goalNote(
  goal: NonNullable<RouterOutputs["household"]["overview"]["goalForecast"]>,
): string {
  const label = `cel „${goal.name}”`;
  if (!goal.forecast) return `(${label}: brak wpłat na cel przy obecnych ustawieniach)`;
  if (goal.forecast.months === 0) return `(${label}: zebrany)`;
  const when = formatMonth(goal.forecast.completionMonth).toLocaleLowerCase("pl-PL");
  return `(${label}: ${goal.forecast.months} mies. · ${when}, brakuje ${formatPln(goal.remainingMinor)})`;
}
