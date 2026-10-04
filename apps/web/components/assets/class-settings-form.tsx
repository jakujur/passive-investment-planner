"use client";

import type { RouterOutputs } from "@pip/api";
import type { AssetClassKind } from "@pip/engine";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { bpToInput, formatBp, formatPln, readPercentBp } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type Instrument = RouterOutputs["instruments"]["list"][number];

export interface QueueAccount {
  id: string;
  name: string;
  broker: string;
  wrapper: string;
  personName: string;
  limit: { limitMinor: bigint; usedMinor: bigint } | null;
}

const LARGE_CLASS_BP = 2000;
const DEFAULT_ABS = 500;
const DEFAULT_REL = 2500;
const WRAPPER_LABEL: Record<string, string> = {
  IKE: "IKE",
  IKE_OBLIGACJE: "IKE-Obl.",
  IKZE: "IKZE",
  IKZE_OBLIGACJE: "IKZE-Obl.",
  REGULAR: "Zwykłe",
  CASH: "Gotówka",
};

export function ClassSettingsForm({
  kind,
  name,
  targetWeightBp,
  bandAbsBp,
  bandRelBp,
  initialQueue,
  purchaseInstrumentId,
  benchmarkInstrumentId,
  accounts,
  instruments,
}: {
  kind: AssetClassKind;
  name: string;
  targetWeightBp: number;
  bandAbsBp: number | null;
  bandRelBp: number | null;
  initialQueue: string[];
  purchaseInstrumentId: string | null;
  benchmarkInstrumentId: string | null;
  accounts: QueueAccount[];
  instruments: Instrument[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const large = targetWeightBp >= LARGE_CLASS_BP;
  const realEstate = kind === "REAL_ESTATE";
  const [queue, setQueue] = useState(initialQueue);
  const [addId, setAddId] = useState("");
  const [purchaseId, setPurchaseId] = useState(purchaseInstrumentId ?? "");
  const [benchmarkId, setBenchmarkId] = useState(benchmarkInstrumentId ?? "");
  const [bandRaw, setBandRaw] = useState(
    large
      ? bandAbsBp === null
        ? ""
        : bpToInput(bandAbsBp)
      : bandRelBp === null
        ? ""
        : bpToInput(bandRelBp),
  );
  const [bandError, setBandError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const update = useMutation(
    trpc.assets.updateClass.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    }),
  );

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const available = accounts.filter((a) => !queue.includes(a.id));
  const showPerson = new Set(accounts.map((a) => a.personName)).size > 1;
  const lastHasLimit = queue.length > 0 && byId.get(queue[queue.length - 1] ?? "")?.limit !== null;
  const defaultBand = large ? `${bpToInput(DEFAULT_ABS)} pp` : `${formatBp(DEFAULT_REL)} wagi`;

  function move(index: number, delta: -1 | 1) {
    setQueue((q) => {
      const next = [...q];
      const target = index + delta;
      if (target < 0 || target >= next.length) return q;
      const [item] = next.splice(index, 1);
      if (item === undefined) return q;
      next.splice(target, 0, item);
      return next;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaved(false);
    let band: number | null = null;
    if (bandRaw.trim() !== "") {
      band = readPercentBp(bandRaw);
      const max = large ? 5000 : 10_000;
      if (band === null || band < 0 || band > max) {
        setBandError(
          large ? "Podaj szerokość w punktach procentowych, np. 5." : "Podaj procent wagi, np. 25.",
        );
        return;
      }
    }
    setBandError(null);
    update.mutate({
      kind,
      bandAbsBp: large ? band : null,
      bandRelBp: large ? null : band,
      accountQueue: realEstate ? [] : queue,
      purchaseInstrumentId: realEstate || purchaseId === "" ? null : purchaseId,
      benchmarkInstrumentId: realEstate || benchmarkId === "" ? null : benchmarkId,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Waga i pasmo</CardTitle>
          <CardDescription>
            Waga docelowa {name.toLocaleLowerCase("pl-PL")}:{" "}
            <strong className="font-medium text-foreground">{formatBp(targetWeightBp)}</strong>.{" "}
            <Link href="/ustawienia" className="underline underline-offset-4 hover:text-foreground">
              Wagi wszystkich klas zmienisz w ustawieniach.
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Field data-invalid={bandError ? true : undefined} className="sm:max-w-xs">
            <FieldLabel htmlFor="band">Pasmo rebalancingu</FieldLabel>
            <InputGroup>
              <InputGroupAddon align="inline-start">±</InputGroupAddon>
              <InputGroupInput
                id="band"
                inputMode="decimal"
                value={bandRaw}
                onChange={(e) => setBandRaw(e.target.value)}
                placeholder={large ? bpToInput(DEFAULT_ABS) : bpToInput(DEFAULT_REL)}
                aria-invalid={bandError ? true : undefined}
                className="tabular-nums"
              />
              <InputGroupAddon align="inline-end">{large ? "pp" : "% wagi"}</InputGroupAddon>
            </InputGroup>
            <FieldDescription>
              {large
                ? `Klasy od 20% mają pasmo w punktach procentowych; domyślnie ±${defaultBand}.`
                : `Klasy poniżej 20% mają pasmo względne; domyślnie ±${defaultBand}.`}{" "}
              Puste pole przywraca domyślne.
            </FieldDescription>
            <FieldError>{bandError}</FieldError>
          </Field>
        </CardContent>
      </Card>

      {!realEstate && (
        <>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Kolejka kont</CardTitle>
              <CardDescription>
                Wpłaty wypełniają konta po kolei do rocznego limitu; ostatnie powinno być bez
                limitu.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {queue.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Kolejka jest pusta — klasa nie dostanie wpłat.
                </p>
              ) : (
                <ol className="border-t border-border">
                  {queue.map((id, index) => {
                    const account = byId.get(id);
                    if (!account) return null;
                    return (
                      <li
                        key={id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3"
                      >
                        <span className="w-6 font-heading text-lg text-muted-foreground tabular-nums">
                          {index + 1}.
                        </span>
                        <div className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-2 text-sm font-medium">
                            {account.name}
                            <Badge variant="secondary">
                              {WRAPPER_LABEL[account.wrapper] ?? account.wrapper}
                            </Badge>
                          </span>
                          <span className="text-sm text-muted-foreground">
                            {account.broker}
                            {showPerson ? ` · ${account.personName}` : ""}
                            {" · "}
                            {account.limit
                              ? `limit ${formatPln(account.limit.limitMinor)} / rok, wykorzystane ${formatPln(account.limit.usedMinor)}`
                              : "bez limitu"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Przesuń ${account.name} wyżej`}
                            disabled={index === 0}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Przesuń ${account.name} niżej`}
                            disabled={index === queue.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Usuń ${account.name} z kolejki`}
                            onClick={() => setQueue((q) => q.filter((x) => x !== id))}
                          >
                            <X />
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
              {lastHasLimit && (
                <p className="text-sm text-warning">
                  Ostatnie konto w kolejce ma limit — po jego wyczerpaniu wpłata nie znajdzie
                  miejsca.
                </p>
              )}
              {available.length > 0 && (
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <Field className="sm:max-w-sm">
                    <FieldLabel htmlFor="add-account">Dodaj konto</FieldLabel>
                    <NativeSelect
                      id="add-account"
                      value={addId}
                      onChange={(e) => setAddId(e.target.value)}
                    >
                      <NativeSelectOption value="">Wybierz konto…</NativeSelectOption>
                      {available.map((a) => (
                        <NativeSelectOption key={a.id} value={a.id}>
                          {a.name} · {a.broker}
                          {showPerson ? ` · ${a.personName}` : ""}
                          {a.limit ? ` (limit ${formatPln(a.limit.limitMinor)})` : " (bez limitu)"}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={addId === ""}
                    onClick={() => {
                      setQueue((q) => [...q, addId]);
                      setAddId("");
                    }}
                  >
                    <Plus data-icon="inline-start" />
                    Do kolejki
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Instrumenty</CardTitle>
              <CardDescription>
                Co kupuje plan i do czego porównuje wycenę na wykresie rynku.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FieldGroup className="gap-6 sm:grid sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="purchase">Instrument do zakupów</FieldLabel>
                  <NativeSelect
                    id="purchase"
                    value={purchaseId}
                    onChange={(e) => setPurchaseId(e.target.value)}
                  >
                    <NativeSelectOption value="">Brak</NativeSelectOption>
                    {instruments.map((i) => (
                      <NativeSelectOption key={i.id} value={i.id}>
                        {i.name}
                        {i.ticker ? ` (${i.ticker})` : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
                <Field>
                  <FieldLabel htmlFor="benchmark">Benchmark</FieldLabel>
                  <NativeSelect
                    id="benchmark"
                    value={benchmarkId}
                    onChange={(e) => setBenchmarkId(e.target.value)}
                  >
                    <NativeSelectOption value="">Taki jak do zakupów</NativeSelectOption>
                    {instruments.map((i) => (
                      <NativeSelectOption key={i.id} value={i.id}>
                        {i.name}
                        {i.ticker ? ` (${i.ticker})` : ""}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>
        </>
      )}

      {update.isError && (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się zapisać</AlertTitle>
          <AlertDescription>{update.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={update.isPending}>
          {update.isPending && <Spinner />}
          Zapisz ustawienia
        </Button>
        {saved && !update.isPending && (
          <span role="status" className="text-sm text-primary">
            Zapisano.
          </span>
        )}
      </div>
    </form>
  );
}

const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF"] as const;

export function AddEtfForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const [isin, setIsin] = useState("");
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState<(typeof CURRENCIES)[number]>("EUR");
  const [quoteSymbol, setQuoteSymbol] = useState("");
  const [errors, setErrors] = useState<{
    isin?: string;
    ticker?: string;
    name?: string;
    quoteSymbol?: string;
  }>({});
  const create = useMutation(
    trpc.instruments.createEtf.mutationOptions({
      onSuccess: () => {
        setIsin("");
        setTicker("");
        setName("");
        setQuoteSymbol("");
        router.refresh();
      },
    }),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    const isinValue = isin.trim().toUpperCase();
    if (!/^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isinValue))
      next.isin = "ISIN ma 12 znaków, np. IE00B6R52259.";
    if (!ticker.trim()) next.ticker = "Podaj ticker.";
    if (!name.trim()) next.name = "Podaj nazwę.";
    if (!quoteSymbol.trim()) next.quoteSymbol = "Podaj symbol notowań, np. VWCE.DE.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    create.mutate({
      isin: isinValue,
      ticker: ticker.trim(),
      name: name.trim(),
      currency,
      quoteSymbol: quoteSymbol.trim(),
    });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Dodaj ETF do katalogu</CardTitle>
        <CardDescription>
          Symbol notowań jest sprawdzany przy dodawaniu — musi zwracać kursy w podanej walucie.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
          <FieldGroup className="gap-6 sm:grid sm:grid-cols-2">
            <Field data-invalid={errors.isin ? true : undefined}>
              <FieldLabel htmlFor="etf-isin">ISIN</FieldLabel>
              <Input
                id="etf-isin"
                value={isin}
                onChange={(e) => setIsin(e.target.value)}
                placeholder="IE00B6R52259"
                aria-invalid={errors.isin ? true : undefined}
                className="uppercase"
              />
              <FieldError>{errors.isin}</FieldError>
            </Field>
            <Field data-invalid={errors.ticker ? true : undefined}>
              <FieldLabel htmlFor="etf-ticker">Ticker</FieldLabel>
              <Input
                id="etf-ticker"
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="VWCE"
                aria-invalid={errors.ticker ? true : undefined}
              />
              <FieldError>{errors.ticker}</FieldError>
            </Field>
            <Field data-invalid={errors.name ? true : undefined} className="sm:col-span-2">
              <FieldLabel htmlFor="etf-name">Nazwa</FieldLabel>
              <Input
                id="etf-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vanguard FTSE All-World UCITS ETF (Acc)"
                aria-invalid={errors.name ? true : undefined}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor="etf-currency">Waluta notowań</FieldLabel>
              <NativeSelect
                id="etf-currency"
                value={currency}
                onChange={(e) => {
                  const next = CURRENCIES.find((c) => c === e.target.value);
                  if (next) setCurrency(next);
                }}
              >
                {CURRENCIES.map((c) => (
                  <NativeSelectOption key={c} value={c}>
                    {c}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field data-invalid={errors.quoteSymbol ? true : undefined}>
              <FieldLabel htmlFor="etf-symbol">Symbol notowań (Yahoo)</FieldLabel>
              <Input
                id="etf-symbol"
                value={quoteSymbol}
                onChange={(e) => setQuoteSymbol(e.target.value)}
                placeholder="VWCE.DE"
                aria-invalid={errors.quoteSymbol ? true : undefined}
              />
              <FieldError>{errors.quoteSymbol}</FieldError>
            </Field>
          </FieldGroup>
          {create.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się dodać ETF</AlertTitle>
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}
          {create.isSuccess && (
            <p role="status" className="text-sm text-primary">
              Dodano do katalogu — możesz go wybrać powyżej.
            </p>
          )}
          <Button
            type="submit"
            variant="secondary"
            disabled={create.isPending}
            className="self-start"
          >
            {create.isPending && <Spinner />}
            Dodaj ETF
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
