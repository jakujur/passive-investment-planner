import type { RouterOutputs } from "@pip/api";
import { AccountsCard } from "@/components/assets/accounts-card";
import { AddBondsDialog } from "@/components/assets/add-bonds-dialog";
import { ClassHead, type HeadFact } from "@/components/assets/class-head";
import { TransactionsTable } from "@/components/assets/transactions";
import { MaturityChart } from "@/components/charts/maturity-chart";
import { ValueChart } from "@/components/charts/value-chart";
import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CLASSES } from "@/lib/classes";
import { formatIsoDate, formatPln, todayIso } from "@/lib/format";
import { serverApi } from "@/lib/session";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "BONDS" }>;

export async function BondsPage() {
  const api = await serverApi();
  const [overviewRaw, transactions, settings, accountOptions] = await Promise.all([
    api.assets.overview({ kind: "BONDS" }),
    api.transactions.list({ assetKind: "BONDS" }),
    api.settings.get(),
    api.accounts.options(),
  ]);
  if (overviewRaw.kind !== "BONDS") return null;
  const overview: Overview = overviewRaw;
  const showPerson = settings.persons.length > 1;
  const totalNominal = overview.lots.reduce((sum, lot) => sum + lot.nominalMinor, 0n);
  const totalUnits = overview.lots.reduce((sum, lot) => sum + lot.units, 0);
  const today = todayIso();
  const nextLot = overview.lots.filter((lot) => lot.maturityDate >= today)[0];
  const facts: HeadFact[] = [
    {
      label: "Serie",
      value: String(overview.lots.length),
      tone: overview.lots.length === 0 ? "muted" : "default",
    },
    {
      label: "Najbliższy wykup",
      value: nextLot
        ? `${formatIsoDate(nextLot.maturityDate)} · ${formatPln(nextLot.nominalMinor)}`
        : "brak",
      tone: nextLot ? "default" : "muted",
    },
    {
      label: "Instrument",
      value: overview.purchaseInstrument?.name ?? "nie ustawiono",
      tone: overview.purchaseInstrument ? "default" : "muted",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Klasa aktywów"
        title={overview.name}
        lead="Detaliczne obligacje skarbowe: każda seria wraca po terminie wykupu, a wpłaty wyznaczają drabinkę."
      />

      <ClassHead overview={overview} facts={facts} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Wpłaty</CardTitle>
            <CardDescription>
              Kapitał w obligacjach tydzień po tygodniu — wycena nominalna, CPI w kolejnym etapie.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overview.series.length === 0 ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
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

      <AccountsCard
        key={overview.queue.map((a) => a.id).join(",")}
        kind="BONDS"
        queue={overview.queue}
        options={accountOptions.BONDS}
        persons={settings.persons.map((p) => ({ id: p.id, name: p.name }))}
        purchaseInstrumentId={overview.purchaseInstrument?.id ?? null}
        accountFill={settings.accountFill}
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Serie</CardTitle>
          <CardDescription>
            Każdy zakup to osobna seria z własnym terminem wykupu. Posiadane obligacje przepiszesz z
            serwisu jak ze „Stanu rachunku rejestrowego”.
          </CardDescription>
          <CardAction>
            <AddBondsDialog accounts={overview.queue} />
          </CardAction>
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
          <CardDescription>
            Zakupy z planu i stan początkowy przepisany z serwisu obligacji; wpisy spoza planu można
            usunąć.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TransactionsTable transactions={transactions} showPerson={showPerson} />
        </CardContent>
      </Card>
    </>
  );
}
