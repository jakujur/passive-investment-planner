import type { RouterOutputs } from "@pip/api";
import { AlertTriangle, Settings2 } from "lucide-react";
import Link from "next/link";
import { ClassPosition } from "@/components/assets/class-position";
import {
  DeletePropertyButton,
  GoalDialog,
  GoalStatusButton,
  PropertyDialog,
} from "@/components/assets/real-estate-dialogs";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { classSettingsPath } from "@/lib/classes";
import { formatBand, formatBp, formatIsoDate, formatPln, percentOf } from "@/lib/format";
import { serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "REAL_ESTATE" }>;
type Property = Overview["properties"][number];

export async function RealEstatePage() {
  const api = await serverApi();
  const overviewRaw = await api.assets.overview({ kind: "REAL_ESTATE" });
  if (overviewRaw.kind !== "REAL_ESTATE") return null;
  const overview: Overview = overviewRaw;
  const position = overview.position;
  const concentrated =
    position?.weightBp !== null &&
    position?.weightBp !== undefined &&
    position.band !== null &&
    position.weightBp > position.band.upperBp;
  const activeGoals = overview.goals.filter((g) => g.status === "ACTIVE");
  const doneGoals = overview.goals.filter((g) => g.status === "DONE");

  return (
    <>
      <PageHeader
        eyebrow="Klasa aktywów"
        title={overview.name}
        lead="Mieszkania własne i na wynajem, kredyty oraz cele na wkład własny."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={classSettingsPath("REAL_ESTATE")} />}
            >
              <Settings2 data-icon="inline-start" />
              Ustawienia klasy
            </Button>
            <PropertyDialog property={null} />
          </>
        }
      />

      {concentrated && position?.band && position.weightBp !== null && (
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>Koncentracja w nieruchomościach</AlertTitle>
          <AlertDescription>
            Nieruchomości stanowią {formatBp(position.weightBp)} portfela przy paśmie{" "}
            {formatBand(position.band)}. Plan kieruje nowe wpłaty do pozostałych klas.
          </AlertDescription>
        </Alert>
      )}

      <ClassPosition
        overview={overview}
        extra={
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-4">
            <Stat label="Wartość" value={formatPln(overview.totals.valueMinor)} />
            <Stat
              label="Zadłużenie"
              value={formatPln(overview.totals.debtMinor)}
              tone={overview.totals.debtMinor > 0n ? "default" : "muted"}
            />
            <Stat label="Kapitał własny" value={formatPln(overview.totals.equityMinor)} />
            <Stat
              label="Czynsz netto / rok"
              value={formatPln(overview.totals.netAnnualRentMinor)}
              tone={overview.totals.netAnnualRentMinor > 0n ? "default" : "muted"}
            />
          </div>
        }
      />

      <Card size="sm">
        <CardContent className="flex flex-wrap items-baseline justify-between gap-4">
          <Stat
            label="Czynsz, który płacisz za mieszkanie"
            value={overview.currentRentMinor !== null ? formatPln(overview.currentRentMinor) : "—"}
            tone={overview.currentRentMinor !== null ? "default" : "muted"}
            hint="miesięcznie; punkt odniesienia dla decyzji kupić czy wynajmować"
          />
          <Button
            variant="link"
            size="sm"
            nativeButton={false}
            render={<Link href="/ustawienia" />}
          >
            Zmień w ustawieniach
          </Button>
        </CardContent>
      </Card>

      <section aria-labelledby="properties-heading" className="flex flex-col gap-4">
        <h2
          id="properties-heading"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Mieszkania
        </h2>
        {overview.properties.length === 0 ? (
          <Card size="sm">
            <CardContent className="flex flex-col gap-2">
              <p className="text-sm">Jeszcze żadnego mieszkania.</p>
              <p className="text-sm text-muted-foreground">
                Dodaj własne lub wynajmowane; z hipoteką policzymy LTV i kapitał własny.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            {overview.properties.map((property) => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </section>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Planowane mieszkania</CardTitle>
          <CardDescription>
            Cele na wkład własny. Plan dopłaca do oznaczonego celu z części nadwyżki przypisanej
            nieruchomościom.
          </CardDescription>
          <div className="col-start-2 row-span-2 row-start-1 self-start justify-self-end">
            <GoalDialog goal={null} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {overview.goals.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak celów.</p>
          )}
          {[...activeGoals, ...doneGoals].map((goal) => {
            const percent = percentOf(goal.savedMinor, goal.targetMinor);
            return (
              <div key={goal.id} className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "text-base font-medium",
                        goal.status === "DONE" && "text-muted-foreground line-through",
                      )}
                    >
                      {goal.name}
                    </span>
                    {goal.funded && <Badge className="text-primary">Zasilany z planu</Badge>}
                    {goal.status === "DONE" && <Badge variant="secondary">Zrealizowany</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <GoalDialog goal={goal} />
                    <GoalStatusButton goal={goal} />
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
          })}
        </CardContent>
      </Card>
    </>
  );
}

function PropertyCard({ property }: { property: Property }) {
  const debt = property.mortgage?.balanceMinor ?? 0n;
  const equityPct = percentOf(property.equityMinor, property.valueMinor);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>{property.name}</CardTitle>
        <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Badge>{property.usage === "RENTAL" ? "Wynajem" : "Własne"}</Badge>
          <Badge variant="secondary">
            {property.financing === "MORTGAGE"
              ? property.paidOff
                ? "Hipoteka · spłacona"
                : "Hipoteka"
              : "Gotówka"}
          </Badge>
          {property.includeInRebalancing && (
            <Badge className="text-primary">Liczone do rebalancingu</Badge>
          )}
        </CardDescription>
        <div className="col-start-2 row-span-2 row-start-1 flex items-center gap-1 self-start justify-self-end">
          <PropertyDialog property={property} />
          <DeletePropertyButton id={property.id} name={property.name} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4">
          <Stat
            label="Wartość"
            value={formatPln(property.valueMinor)}
            hint={`wycena ${formatIsoDate(property.valuationDate)}`}
          />
          <Stat label="Kapitał własny" value={formatPln(property.equityMinor)} />
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <span>Kapitał vs dług</span>
            <span className="tabular-nums">LTV {formatBp(property.ltvBp)}</span>
          </div>
          <div aria-hidden className="flex h-3 w-full gap-px overflow-hidden bg-muted">
            <div className="bg-class-real-estate" style={{ flexBasis: `${equityPct}%` }} />
            {debt > 0n && (
              <div className="bg-class-cushion" style={{ flexBasis: `${100 - equityPct}%` }} />
            )}
          </div>
          <div className="flex justify-between text-sm">
            <span>
              <span aria-hidden className="mr-2 inline-block size-2.5 bg-class-real-estate" />
              własne {formatPln(property.equityMinor)}
            </span>
            <span className="text-muted-foreground tabular-nums">
              <span aria-hidden className="mr-2 inline-block size-2.5 bg-class-cushion" />
              dług {formatPln(debt)}
            </span>
          </div>
        </div>

        {property.mortgage && !property.paidOff && (
          <dl className="grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Saldo
              </dt>
              <dd className="tabular-nums">{formatPln(property.mortgage.balanceMinor)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Oprocentowanie
              </dt>
              <dd className="tabular-nums">{formatBp(property.mortgage.rateBp, 2)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Rata
              </dt>
              <dd className="tabular-nums">{formatPln(property.mortgage.installmentMinor)}</dd>
            </div>
          </dl>
        )}

        {property.rental && property.netAnnualRentMinor !== null && (
          <dl className="grid grid-cols-3 gap-4 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Czynsz
              </dt>
              <dd className="tabular-nums">{formatPln(property.rental.rentMinor)} / mies.</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Netto / rok
              </dt>
              <dd className="tabular-nums">{formatPln(property.netAnnualRentMinor)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Rentowność
              </dt>
              <dd className="tabular-nums">
                {property.netYieldBp !== null ? formatBp(property.netYieldBp, 2) : "—"}
              </dd>
            </div>
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
