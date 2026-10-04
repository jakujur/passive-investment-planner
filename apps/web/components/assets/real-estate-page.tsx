import type { RouterOutputs } from "@pip/api";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { ClassHead, type HeadFact } from "@/components/assets/class-head";
import {
  type MortgageDetail,
  MortgagePanel,
  MortgageSummary,
} from "@/components/assets/mortgage-panel";
import {
  CompleteGoalDialog,
  DeletePropertyButton,
  GoalDialog,
  PropertyDialog,
} from "@/components/assets/real-estate-dialogs";
import { RentCard } from "@/components/assets/rent-card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  formatBand,
  formatBp,
  formatIsoDate,
  formatMonth,
  formatPln,
  percentOf,
} from "@/lib/format";
import { serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "REAL_ESTATE" }>;
type Property = Overview["properties"][number];
type Goal = Overview["goals"][number];
type GoalForecast = RouterOutputs["household"]["overview"]["goalForecast"];

const STAGES = ["Cel", "Kupione", "Nadpłaty"] as const;

export async function RealEstatePage() {
  const api = await serverApi();
  const [overviewRaw, { goalForecast }] = await Promise.all([
    api.assets.overview({ kind: "REAL_ESTATE" }),
    api.household.overview(),
  ]);
  if (overviewRaw.kind !== "REAL_ESTATE") return null;
  const overview: Overview = overviewRaw;
  const details = new Map(
    await Promise.all(
      overview.properties
        .filter((p) => p.mortgage !== null)
        .map(
          async (p) => [p.id, await api.realEstate.mortgageDetail({ propertyId: p.id })] as const,
        ),
    ),
  );
  const position = overview.position;
  const concentrated =
    position?.weightBp !== null &&
    position?.weightBp !== undefined &&
    position.band !== null &&
    position.weightBp > position.band.upperBp;
  const activeGoals = overview.goals.filter((g) => g.status === "ACTIVE");
  const doneGoals = overview.goals.filter((g) => g.status === "DONE");
  const overpaying = overview.properties.some(
    (p) => p.includeInRebalancing && p.mortgage !== null && !p.paidOff,
  );
  const facts: HeadFact[] = [
    {
      label: "Mieszkania",
      value: formatPln(overview.totals.valueMinor),
      tone: overview.totals.valueMinor === 0n ? "muted" : "default",
    },
    {
      label: "Zadłużenie",
      value: formatPln(overview.totals.debtMinor),
      tone: overview.totals.debtMinor === 0n ? "muted" : "default",
    },
    {
      label: "Kapitał własny",
      value: formatPln(overview.totals.equityMinor),
      tone: overview.totals.equityMinor === 0n ? "muted" : "default",
    },
    {
      label: "Czynsz netto / rok",
      value: formatPln(overview.totals.netAnnualRentMinor),
      tone: overview.totals.netAnnualRentMinor === 0n ? "muted" : "default",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Klasa aktywów"
        title={overview.name}
        lead="Od odkładania na mieszkanie po spłatę kredytu — jedna ścieżka, trzy etapy."
      />

      {concentrated && position?.band && position.weightBp !== null && (
        <p className="flex items-start gap-2 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            Koncentracja: nieruchomości to {formatBp(position.weightBp)} portfela przy tolerancji{" "}
            {formatBand(position.band)} — plan kieruje nowe wpłaty do pozostałych klas.
          </span>
        </p>
      )}

      <ClassHead overview={overview} facts={facts} />

      <Card size="sm">
        <CardHeader className="sm:grid-cols-[1fr_auto]">
          <CardTitle>Mieszkania</CardTitle>
          <CardDescription className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
            {STAGES.map((stage, index) => (
              <span key={stage} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight aria-hidden className="size-3.5" />}
                <span
                  className={cn(
                    "text-xs font-semibold tracking-wide uppercase",
                    (index === 0 && activeGoals.length > 0) ||
                      (index === 1 && overview.properties.length > 0) ||
                      (index === 2 && overpaying)
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {stage}
                </span>
              </span>
            ))}
            <span className="ml-1 text-muted-foreground">(nadpłaty tylko przy hipotece)</span>
          </CardDescription>
          <div className="flex flex-wrap items-center gap-2 pt-1 sm:col-start-2 sm:row-span-2 sm:row-start-1 sm:justify-end sm:self-start sm:pt-0">
            <GoalDialog goal={null} />
            <PropertyDialog property={null} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <section aria-labelledby="goals-heading" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5 border-t border-border pt-3">
              <h3
                id="goals-heading"
                className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                1 · Zbieram na wkład własny lub zakup
              </h3>
              <p className="text-sm text-muted-foreground">
                Dopóki cel jest aktywny, część wpłaty przypadająca na nieruchomości idzie na ten cel
                — wkład własny pod kredyt albo całą cenę za gotówkę.
              </p>
            </div>
            {activeGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Brak celu — plan nie odkłada na mieszkanie.
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {activeGoals.map((goal) => (
                  <li key={goal.id}>
                    <GoalRow
                      goal={goal}
                      forecast={goalForecast?.goalId === goal.id ? goalForecast : null}
                    />
                  </li>
                ))}
              </ul>
            )}
            {doneGoals.length > 0 && (
              <details className="group text-sm">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
                  Zrealizowane ({doneGoals.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1 pl-5 text-muted-foreground">
                  {doneGoals.map((goal) => (
                    <li key={goal.id} className="flex justify-between gap-4 tabular-nums">
                      <span className="line-through">{goal.name}</span>
                      <span>{formatPln(goal.savedMinor)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section aria-labelledby="owned-heading" className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5 border-t border-border pt-3">
              <h3
                id="owned-heading"
                className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                2 · Posiadane
              </h3>
              <p className="text-sm text-muted-foreground">
                Po zakupie z hipoteką liczoną do portfela ta część wpłaty idzie na nadpłaty kredytu
                — chyba że nieruchomości są powyżej tolerancji.
              </p>
            </div>
            {overview.properties.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Jeszcze żadnego mieszkania. Zamknij cel przyciskiem „Kupione” albo dodaj posiadane.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {overview.properties.map((property) => (
                  <PropertyCard
                    key={property.id}
                    property={property}
                    detail={details.get(property.id) ?? null}
                  />
                ))}
              </div>
            )}
          </section>
        </CardContent>
      </Card>

      <RentCard currentRentMinor={overview.currentRentMinor} />
    </>
  );
}

function goalEta(forecast: NonNullable<GoalForecast>): string {
  if (!forecast.forecast) return "brak wpłat na cel przy obecnych ustawieniach";
  if (forecast.forecast.months === 0) return "kwota zebrana";
  return `zbierzesz w ${forecast.forecast.months} mies. — ${formatMonth(forecast.forecast.completionMonth).toLocaleLowerCase("pl-PL")}`;
}

function GoalRow({ goal, forecast }: { goal: Goal; forecast: GoalForecast }) {
  const percent = percentOf(goal.savedMinor, goal.targetMinor);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{goal.name}</span>
          {goal.funded && <Badge className="text-primary">Zasilany z planu</Badge>}
          {forecast && (
            <span className="text-sm text-muted-foreground tabular-nums">{goalEta(forecast)}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <GoalDialog goal={goal} />
          <CompleteGoalDialog goal={goal} />
        </div>
      </div>
      <Progress value={Math.min(100, percent)} aria-label={`Postęp celu ${goal.name}`}>
        <span className="text-sm tabular-nums">
          {formatPln(goal.savedMinor)}
          <span className="text-muted-foreground"> / {formatPln(goal.targetMinor)}</span>
        </span>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          {Math.round(percent)}%
        </span>
      </Progress>
    </div>
  );
}

function PropertyCard({ property, detail }: { property: Property; detail: MortgageDetail | null }) {
  const debt = property.mortgage?.balanceMinor ?? 0n;
  const equityPct = percentOf(property.equityMinor, property.valueMinor);
  return (
    <div className="flex min-w-0 flex-col gap-4 border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="font-heading text-lg leading-tight">{property.name}</span>
          <span className="flex flex-wrap items-center gap-1.5">
            <Badge>{property.usage === "RENTAL" ? "Wynajem" : "Własne"}</Badge>
            <Badge variant="secondary">
              {property.financing === "MORTGAGE"
                ? property.paidOff
                  ? "Hipoteka · spłacona"
                  : "Hipoteka"
                : "Gotówka"}
            </Badge>
            {property.includeInRebalancing && (
              <Badge className="text-primary">Liczone do portfela</Badge>
            )}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <PropertyDialog property={property} />
          <DeletePropertyButton id={property.id} name={property.name} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            Wartość · wycena {formatIsoDate(property.valuationDate)}
          </span>
          <span className="font-medium tabular-nums">{formatPln(property.valueMinor)}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">
            Kapitał własny · LTV {formatBp(property.ltvBp)}
          </span>
          <span className="font-medium tabular-nums">{formatPln(property.equityMinor)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div aria-hidden className="flex h-2 w-full gap-px overflow-hidden bg-muted">
          <div className="bg-class-real-estate" style={{ flexBasis: `${equityPct}%` }} />
          {debt > 0n && (
            <div className="bg-class-cushion" style={{ flexBasis: `${100 - equityPct}%` }} />
          )}
        </div>
        <div className="flex justify-between text-xs">
          <span>
            <span aria-hidden className="mr-1.5 inline-block size-2 bg-class-real-estate" />
            własne {formatPln(property.equityMinor)}
          </span>
          <span className="text-muted-foreground tabular-nums">
            <span aria-hidden className="mr-1.5 inline-block size-2 bg-class-cushion" />
            dług {formatPln(debt)}
          </span>
        </div>
      </div>

      {detail && (
        <>
          <MortgageSummary detail={detail} className="border-t border-border pt-3" />
          <MortgagePanel propertyId={property.id} propertyName={property.name} detail={detail} />
        </>
      )}

      {property.rental && property.netAnnualRentMinor !== null && (
        <dl className="grid grid-cols-3 gap-3 border-t border-border pt-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Czynsz</dt>
            <dd className="tabular-nums">{formatPln(property.rental.rentMinor)} / mies.</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Netto / rok</dt>
            <dd className="tabular-nums">{formatPln(property.netAnnualRentMinor)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Rentowność</dt>
            <dd className="tabular-nums">
              {property.netYieldBp !== null ? formatBp(property.netYieldBp, 2) : "—"}
            </dd>
          </div>
        </dl>
      )}
    </div>
  );
}
