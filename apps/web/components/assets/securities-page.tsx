import type { RouterOutputs } from "@pip/api";
import { parseQuantity, QUANTITY_DIGITS } from "@pip/engine";
import { AccountsCard } from "@/components/assets/accounts-card";
import { AddPositionDialog } from "@/components/assets/add-position-dialog";
import { ClassHead, type HeadFact } from "@/components/assets/class-head";
import { InstrumentCard } from "@/components/assets/instrument-card";
import {
  type AccountOption,
  AddTransactionDialog,
  TransactionsTable,
} from "@/components/assets/transactions";
import { MarketChart } from "@/components/charts/market-chart";
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
import { formatBp, formatIsoDate, formatPln, formatQuantity, percentOf } from "@/lib/format";
import { serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "EQUITY" | "GOLD" }>;

const QUANTITY_SCALE = 10n ** BigInt(QUANTITY_DIGITS);

/** Amount per one unit (or gram) from a total and a decimal quantity; `null` for an empty quantity. */
function perUnit(totalMinor: bigint, quantity: string): bigint | null {
  const scaled = parseQuantity(quantity);
  return scaled === 0n ? null : (totalMinor * QUANTITY_SCALE) / scaled;
}

function formatGainPercent(gainMinor: bigint, costMinor: bigint): string {
  if (costMinor <= 0n) return "";
  const percent = percentOf(gainMinor < 0n ? -gainMinor : gainMinor, costMinor);
  return ` (${gainMinor < 0n ? "−" : "+"}${percent.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%)`;
}

export async function SecuritiesPage({ kind }: { kind: "EQUITY" | "GOLD" }) {
  const api = await serverApi();
  const [overviewRaw, transactions, instruments, settings, accountOptions] = await Promise.all([
    api.assets.overview({ kind }),
    api.transactions.list({ assetKind: kind }),
    api.instruments.list({ assetKind: kind }),
    api.settings.get(),
    api.accounts.options(),
  ]);
  if (overviewRaw.kind !== kind) return null;
  const overview: Overview = overviewRaw;
  const meta = CLASSES[kind];
  const accounts: AccountOption[] = overview.queue.map((a) => ({
    id: a.id,
    name: a.name,
    broker: a.broker,
    currency: a.currency,
    personName: a.personName,
    inQueue: true,
  }));
  const showPerson = settings.persons.length > 1;
  const instrumentName = (id: string) => {
    const instrument = instruments.find((i) => i.id === id);
    return instrument
      ? `${instrument.name}${instrument.ticker ? ` (${instrument.ticker})` : ""}`
      : id;
  };
  const empty = overview.series.length === 0;
  const totals = overview.holdings.reduce(
    (acc, h) => ({ cost: acc.cost + h.costMinor, value: acc.value + h.valueMinor }),
    { cost: 0n, value: 0n },
  );
  const gain = totals.value - totals.cost;
  const facts: HeadFact[] = [
    {
      label: "Wpłacono",
      value: formatPln(totals.cost),
      tone: totals.cost === 0n ? "muted" : "default",
    },
    {
      label: "Wynik",
      value: `${gain > 0n ? "+" : ""}${formatPln(gain)}`,
      tone: gain > 0n ? "positive" : gain < 0n ? "negative" : "muted",
    },
  ];
  if (kind === "EQUITY" && overview.drawdownBp > 0) {
    facts.push({
      label: "Od szczytu",
      value: `−${formatBp(overview.drawdownBp)}`,
      tone: "warning",
    });
  }
  facts.push({
    label: "Ostatnie notowanie",
    value: overview.lastQuote ? formatIsoDate(overview.lastQuote.date) : "brak",
    tone: overview.lastQuote ? "default" : "muted",
  });

  return (
    <>
      <PageHeader
        eyebrow="Klasa aktywów"
        title={overview.name}
        lead={
          overview.purchaseInstrument
            ? `Plan kupuje: ${overview.purchaseInstrument.name}${overview.purchaseInstrument.ticker ? ` (${overview.purchaseInstrument.ticker})` : ""}.`
            : "Brak ustawionego instrumentu do zakupów."
        }
      />

      <ClassHead overview={overview} facts={facts} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Twój portfel</CardTitle>
            <CardDescription>Wartość pozycji na tle wpłaconego kapitału.</CardDescription>
          </CardHeader>
          <CardContent>
            {empty ? (
              <div className="flex flex-col gap-1 border-t border-border pt-3">
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
              {overview.purchaseInstrument
                ? `${overview.purchaseInstrument.name} w złotych${overview.marketCurrency !== "PLN" ? ` (kurs ${overview.marketCurrency} wg NBP)` : ""}; ceny Twoich zakupów jako linie.`
                : "Brak instrumentu."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <MarketChart
              market={overview.market}
              lastQuote={overview.lastQuote}
              meta={meta}
              unitLabel={kind === "GOLD" ? "za gram" : "za jednostkę"}
              quantityUnit={kind === "GOLD" ? "g" : "szt."}
              purchaseMarks={overview.purchaseMarks}
            />
          </CardContent>
        </Card>
      </div>

      <div
        className={cn(
          "grid gap-4",
          kind === "EQUITY" && "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]",
        )}
      >
        <AccountsCard
          key={overview.queue.map((a) => a.id).join(",")}
          kind={kind}
          queue={overview.queue}
          options={accountOptions[kind]}
          persons={settings.persons.map((p) => ({ id: p.id, name: p.name }))}
          purchaseInstrumentId={overview.purchaseInstrument?.id ?? null}
          accountFill={settings.accountFill}
        />
        {kind === "EQUITY" && (
          <InstrumentCard instrument={overview.purchaseInstrument} lastQuote={overview.lastQuote} />
        )}
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Pozycje</CardTitle>
          <CardDescription>
            Ile masz i ile zarobiłeś: ilość, średnia cena zakupu, kurs, wartość i zysk.
          </CardDescription>
          <CardAction>
            <AddPositionDialog
              kind={kind}
              accounts={overview.queue}
              instruments={instruments}
              defaultInstrumentId={overview.purchaseInstrument?.id ?? null}
              lastQuote={overview.lastQuote}
            />
          </CardAction>
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
                  <TableHead className="text-right">Śr. cena</TableHead>
                  <TableHead className="text-right">Kurs</TableHead>
                  <TableHead className="text-right">Koszt</TableHead>
                  <TableHead className="text-right">Wartość</TableHead>
                  <TableHead className="text-right">Zysk</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.holdings.map((h) => {
                  const rowGain = h.valueMinor - h.costMinor;
                  const average = perUnit(h.costMinor, h.quantity);
                  const price = perUnit(h.valueMinor, h.quantity);
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
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatQuantity(h.quantity)} {kind === "GOLD" ? "g" : "szt."}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums whitespace-nowrap">
                        {average !== null ? formatPln(average) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {price !== null ? formatPln(price) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums whitespace-nowrap">
                        {formatPln(h.costMinor)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
                        {formatPln(h.valueMinor)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums whitespace-nowrap",
                          rowGain > 0n && "text-primary",
                          rowGain < 0n && "text-destructive",
                        )}
                      >
                        {rowGain > 0n ? "+" : ""}
                        {formatPln(rowGain)}
                        <span className="text-xs">{formatGainPercent(rowGain, h.costMinor)}</span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5}>Razem</TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatPln(totals.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums whitespace-nowrap">
                    {formatPln(totals.value)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right tabular-nums whitespace-nowrap",
                      gain > 0n && "text-primary",
                      gain < 0n && "text-destructive",
                    )}
                  >
                    {gain > 0n ? "+" : ""}
                    {formatPln(gain)}
                    <span className="text-xs">{formatGainPercent(gain, totals.cost)}</span>
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
            Zakupy z planu i dodane ręcznie; ręczne można usunąć. Wcześniejszy zakup to zakup spoza
            planu, np. sprzed korzystania z aplikacji.
          </CardDescription>
          <CardAction>
            <AddTransactionDialog
              accounts={accounts}
              instruments={instruments}
              defaultInstrumentId={overview.purchaseInstrument?.id ?? null}
              bonds={false}
            />
          </CardAction>
        </CardHeader>
        <CardContent>
          <TransactionsTable transactions={transactions} showPerson={showPerson} />
        </CardContent>
      </Card>
    </>
  );
}
