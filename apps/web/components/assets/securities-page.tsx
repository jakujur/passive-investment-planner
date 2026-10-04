import type { RouterOutputs } from "@pip/api";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { ClassPosition } from "@/components/assets/class-position";
import {
  type AccountOption,
  AddTransactionDialog,
  TransactionsTable,
} from "@/components/assets/transactions";
import { MarketChart } from "@/components/charts/market-chart";
import { ValueChart } from "@/components/charts/value-chart";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLASSES, classSettingsPath } from "@/lib/classes";
import { formatPln, formatQuantity } from "@/lib/format";
import { serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "EQUITY" | "GOLD" }>;

export async function SecuritiesPage({ kind }: { kind: "EQUITY" | "GOLD" }) {
  const api = await serverApi();
  const [overviewRaw, transactions, instruments, settings] = await Promise.all([
    api.assets.overview({ kind }),
    api.transactions.list({ assetKind: kind }),
    api.instruments.list({ assetKind: kind }),
    api.settings.get(),
  ]);
  if (overviewRaw.kind !== kind) return null;
  const overview: Overview = overviewRaw;
  const meta = CLASSES[kind];
  const queueIds = new Set(overview.queue.map((a) => a.id));
  const queueRank = (id: string) => {
    const index = overview.queue.findIndex((a) => a.id === id);
    return index === -1 ? overview.queue.length : index;
  };
  const accounts: AccountOption[] = settings.persons
    .flatMap((p) => p.accounts.map((a) => ({ ...a, personName: p.name })))
    .filter((a) => a.wrapper !== "CASH")
    .map((a) => ({
      id: a.id,
      name: a.name,
      broker: a.broker,
      currency: a.currency,
      personName: a.personName,
      inQueue: queueIds.has(a.id),
    }))
    .sort((a, b) => queueRank(a.id) - queueRank(b.id));
  const showPerson = settings.persons.length > 1;
  const instrumentName = (id: string) => {
    const instrument = instruments.find((i) => i.id === id);
    return instrument
      ? `${instrument.name}${instrument.ticker ? ` (${instrument.ticker})` : ""}`
      : id;
  };
  const marketInstrument = overview.benchmarkInstrument ?? overview.purchaseInstrument;
  const empty = overview.series.length === 0;
  const totals = overview.holdings.reduce(
    (acc, h) => ({ cost: acc.cost + h.costMinor, value: acc.value + h.valueMinor }),
    { cost: 0n, value: 0n },
  );

  return (
    <>
      <PageHeader
        eyebrow="Klasa aktywów"
        title={overview.name}
        lead={
          overview.purchaseInstrument
            ? `Kupowany instrument: ${overview.purchaseInstrument.name}${overview.purchaseInstrument.ticker ? ` (${overview.purchaseInstrument.ticker})` : ""}.`
            : "Brak ustawionego instrumentu do zakupów."
        }
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={classSettingsPath(kind)} />}
            >
              <Settings2 data-icon="inline-start" />
              Ustawienia klasy
            </Button>
            <AddTransactionDialog
              accounts={accounts}
              instruments={instruments}
              defaultInstrumentId={overview.purchaseInstrument?.id ?? null}
              bonds={false}
            />
          </>
        }
      />

      <ClassPosition
        overview={overview}
        drawdownBp={kind === "EQUITY" ? overview.drawdownBp : undefined}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Twój portfel</CardTitle>
            <CardDescription>
              Wartość pozycji na tle wpłaconego kapitału, tydzień po tygodniu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {empty ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-sm">Jeszcze nic nie kupiono.</p>
                <p className="text-sm text-muted-foreground">
                  Pierwszy punkt pojawi się po zaksięgowaniu planu albo po ręcznym dodaniu zakupu.
                </p>
              </div>
            ) : (
              <ValueChart series={overview.series} meta={meta} />
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Rynek</CardTitle>
            <CardDescription>
              {marketInstrument
                ? `${marketInstrument.name}${marketInstrument.ticker ? ` (${marketInstrument.ticker})` : ""} w złotych${overview.marketCurrency !== "PLN" ? ` — kurs ${overview.marketCurrency} wg NBP` : ""}.`
                : "Brak instrumentu odniesienia."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MarketChart
              market={overview.market}
              lastQuote={overview.lastQuote}
              meta={meta}
              unitLabel={kind === "GOLD" ? "za gram" : "za jednostkę"}
            />
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Pozycje</CardTitle>
          <CardDescription>Stan na kontach: ilość, koszt zakupu i bieżąca wycena.</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak pozycji.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Konto</TableHead>
                  <TableHead>Instrument</TableHead>
                  <TableHead className="text-right">Ilość</TableHead>
                  <TableHead className="text-right">Koszt</TableHead>
                  <TableHead className="text-right">Wartość</TableHead>
                  <TableHead className="text-right">Wynik</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.holdings.map((h) => {
                  const gain = h.valueMinor - h.costMinor;
                  return (
                    <TableRow key={`${h.account?.id}-${h.instrumentId}`}>
                      <TableCell>
                        {h.account ? (
                          <>
                            {h.account.name}
                            <span className="text-muted-foreground">
                              {" "}
                              · {h.account.broker}
                              {showPerson ? ` · ${h.account.personName}` : ""}
                            </span>
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {instrumentName(h.instrumentId)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(h.quantity)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPln(h.costMinor)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatPln(h.valueMinor)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          gain > 0n && "text-primary",
                          gain < 0n && "text-destructive",
                        )}
                      >
                        {gain > 0n ? "+" : ""}
                        {formatPln(gain)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>Razem</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPln(totals.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPln(totals.value)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totals.value - totals.cost > 0n ? "+" : ""}
                    {formatPln(totals.value - totals.cost)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Transakcje</CardTitle>
          <CardDescription>Zakupy z planu i dodane ręcznie; ręczne można usunąć.</CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsTable transactions={transactions} showPerson={showPerson} />
        </CardContent>
      </Card>
    </>
  );
}
