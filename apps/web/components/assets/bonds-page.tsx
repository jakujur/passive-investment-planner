import type { RouterOutputs } from "@pip/api";
import { Settings2 } from "lucide-react";
import Link from "next/link";
import { ClassPosition } from "@/components/assets/class-position";
import {
  type AccountOption,
  AddTransactionDialog,
  TransactionsTable,
} from "@/components/assets/transactions";
import { MaturityChart } from "@/components/charts/maturity-chart";
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
import { formatIsoDate, formatPln } from "@/lib/format";
import { serverApi } from "@/lib/session";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "BONDS" }>;

export async function BondsPage() {
  const api = await serverApi();
  const [overviewRaw, transactions, instruments, settings] = await Promise.all([
    api.assets.overview({ kind: "BONDS" }),
    api.transactions.list({ assetKind: "BONDS" }),
    api.instruments.list({ assetKind: "BONDS" }),
    api.settings.get(),
  ]);
  if (overviewRaw.kind !== "BONDS") return null;
  const overview: Overview = overviewRaw;
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
  const totalNominal = overview.lots.reduce((sum, lot) => sum + lot.nominalMinor, 0n);
  const totalUnits = overview.lots.reduce((sum, lot) => sum + lot.units, 0);

  return (
    <>
      <PageHeader
        eyebrow="Klasa aktywów"
        title={overview.name}
        lead="Detaliczne obligacje skarbowe: każda seria wraca po terminie wykupu, a wpłaty wyznaczają drabinkę."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={classSettingsPath("BONDS")} />}
            >
              <Settings2 data-icon="inline-start" />
              Ustawienia klasy
            </Button>
            <AddTransactionDialog
              accounts={accounts}
              instruments={instruments}
              defaultInstrumentId={overview.purchaseInstrument?.id ?? null}
              bonds
            />
          </>
        }
      />

      <ClassPosition overview={overview} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Wpłaty</CardTitle>
            <CardDescription>
              Kapitał w obligacjach tydzień po tygodniu — wycena nominalna, CPI w kolejnym etapie.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.series.length === 0 ? (
              <div className="flex flex-col gap-2 border-t border-border pt-4">
                <p className="text-sm">Jeszcze nic nie kupiono.</p>
                <p className="text-sm text-muted-foreground">
                  Pierwszy punkt pojawi się po zaksięgowaniu planu albo po ręcznym dodaniu zakupu.
                </p>
              </div>
            ) : (
              <ValueChart series={overview.series} meta={CLASSES.BONDS} valueLabel="Nominał" />
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Drabinka wykupów</CardTitle>
            <CardDescription>
              Nominał wracający w kolejnych latach — po dziesięciu latach każda seria wypłaca
              kapitał z odsetkami.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.maturities.length === 0 ? (
              <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                Drabinka zbuduje się z pierwszych zakupów.
              </p>
            ) : (
              <MaturityChart maturities={overview.maturities} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Serie</CardTitle>
          <CardDescription>Każdy zakup to osobna seria z własnym terminem wykupu.</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.lots.length === 0 ? (
            <p className="text-sm text-muted-foreground">Brak serii.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Seria</TableHead>
                  <TableHead>Zakup</TableHead>
                  <TableHead>Wykup</TableHead>
                  <TableHead>Konto</TableHead>
                  <TableHead className="text-right">Sztuk</TableHead>
                  <TableHead className="text-right">Nominał</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.lots.map((lot) => (
                  <TableRow key={lot.id}>
                    <TableCell className="font-medium">{lot.series}</TableCell>
                    <TableCell className="tabular-nums">
                      {formatIsoDate(lot.purchaseDate)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatIsoDate(lot.maturityDate)}
                    </TableCell>
                    <TableCell>
                      {lot.account ? (
                        <>
                          {lot.account.name}
                          <span className="text-muted-foreground">
                            {" "}
                            · {lot.account.broker}
                            {showPerson ? ` · ${lot.account.personName}` : ""}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{lot.units}</TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPln(lot.nominalMinor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={4}>Razem</TableCell>
                  <TableCell className="text-right tabular-nums">{totalUnits}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPln(totalNominal)}
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
