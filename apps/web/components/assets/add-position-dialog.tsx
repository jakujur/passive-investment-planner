"use client";

import type { RouterOutputs } from "@pip/api";
import { parseQuantity, QUANTITY_DIGITS } from "@pip/engine";
import { formatMoney, money } from "@pip/money";
import { useMutation } from "@tanstack/react-query";
import { PackagePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { formatIsoDate, formatPln, MONEY_FORMAT_HINT, readMoney, todayIso } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "EQUITY" | "GOLD" }>;
type QueueAccount = Overview["queue"][number];
type Instrument = RouterOutputs["instruments"]["list"][number];

const QUANTITY_SCALE = 10n ** BigInt(QUANTITY_DIGITS);
const QUANTITY_PATTERN = /^\d+(\.\d{1,8})?$/;

function isTaxAccount(wrapper: QueueAccount["wrapper"]): boolean {
  return wrapper !== "REGULAR" && wrapper !== "CASH";
}

interface Errors {
  accountId?: string;
  instrumentId?: string;
  quantity?: string;
  price?: string;
  date?: string;
  deposits?: string;
}

/** "Dodaj posiadane": the current holding (quantity × average price) without its history. */
export function AddPositionDialog({
  kind,
  accounts,
  instruments,
  defaultInstrumentId,
  lastQuote,
}: {
  kind: "EQUITY" | "GOLD";
  accounts: QueueAccount[];
  instruments: Instrument[];
  defaultInstrumentId: string | null;
  lastQuote: Overview["lastQuote"];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const unit = kind === "GOLD" ? "g" : "szt.";
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId ?? instruments[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(todayIso());
  const [deposits, setDeposits] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const add = useMutation(
    trpc.transactions.addPosition.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const taxAccount = account !== null && isTaxAccount(account.wrapper);
  const currency = account?.currency ?? "PLN";

  const quantityScaled = QUANTITY_PATTERN.test(quantity.trim().replace(",", "."))
    ? parseQuantity(quantity.trim().replace(",", "."))
    : null;
  const priceMinor = readMoney(price);
  const costMinor =
    quantityScaled !== null && priceMinor !== null && priceMinor > 0n
      ? (quantityScaled * priceMinor) / QUANTITY_SCALE
      : null;
  // The latest quote belongs to the plan instrument and is in PLN; other cases have no preview.
  const quoteApplies =
    instrumentId === defaultInstrumentId && lastQuote !== null && currency === "PLN";
  const valueMinor =
    quoteApplies && quantityScaled !== null
      ? (quantityScaled * lastQuote.priceMinor) / QUANTITY_SCALE
      : null;
  const gainMinor = valueMinor !== null && costMinor !== null ? valueMinor - costMinor : null;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setQuantity("");
      setPrice("");
      setDeposits("");
      setDate(todayIso());
      setErrors({});
      add.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    if (!accountId) next.accountId = "Wybierz konto.";
    if (!instrumentId) next.instrumentId = "Wybierz instrument.";
    const normalizedQuantity = quantity.trim().replace(",", ".");
    if (!QUANTITY_PATTERN.test(normalizedQuantity) || parseQuantity(normalizedQuantity) === 0n)
      next.quantity = `Podaj ilość w ${unit}, np. ${kind === "GOLD" ? "12,5" : "25"}.`;
    if (priceMinor === null || priceMinor < 1n) next.price = MONEY_FORMAT_HINT;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Podaj datę.";
    const depositsMinor = deposits.trim() === "" ? null : readMoney(deposits);
    if (deposits.trim() !== "" && (depositsMinor === null || depositsMinor < 0n))
      next.deposits = MONEY_FORMAT_HINT;
    setErrors(next);
    if (Object.keys(next).length > 0 || priceMinor === null) return;
    add.mutate({
      accountId,
      instrumentId,
      date,
      quantity: normalizedQuantity,
      averagePriceMinor: priceMinor,
      depositsThisYearMinor: taxAccount ? depositsMinor : null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <PackagePlus data-icon="inline-start" />
        Dodaj posiadane
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Posiadana pozycja</DialogTitle>
            <DialogDescription>
              Ile masz i po ile średnio kupowałeś — bez przepisywania historii. Zapisze się jako
              stan początkowy na podaną datę.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field data-invalid={errors.accountId ? true : undefined}>
                <FieldLabel htmlFor="pos-account">Konto</FieldLabel>
                <NativeSelect
                  id="pos-account"
                  className="w-full"
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <NativeSelectOption key={a.id} value={a.id}>
                      {a.name} · {a.broker}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError>{errors.accountId}</FieldError>
              </Field>
              <Field data-invalid={errors.instrumentId ? true : undefined}>
                <FieldLabel htmlFor="pos-instrument">Instrument</FieldLabel>
                <NativeSelect
                  id="pos-instrument"
                  className="w-full"
                  value={instrumentId}
                  onChange={(e) => setInstrumentId(e.target.value)}
                  disabled={kind === "GOLD"}
                >
                  {instruments.map((i) => (
                    <NativeSelectOption key={i.id} value={i.id}>
                      {i.name}
                      {i.ticker ? ` (${i.ticker})` : ""}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError>{errors.instrumentId}</FieldError>
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field data-invalid={errors.quantity ? true : undefined}>
                <FieldLabel htmlFor="pos-quantity">Ilość</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    id="pos-quantity"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={kind === "GOLD" ? "12,5" : "25"}
                    aria-invalid={errors.quantity ? true : undefined}
                    className="tabular-nums"
                  />
                  <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
                </InputGroup>
                <FieldError>{errors.quantity}</FieldError>
              </Field>
              <Field data-invalid={errors.price ? true : undefined}>
                <FieldLabel htmlFor="pos-price">Średnia cena</FieldLabel>
                <MoneyInput
                  id="pos-price"
                  value={price}
                  onChange={setPrice}
                  unit={`${currency === "PLN" ? "zł" : currency}/${kind === "GOLD" ? "g" : "szt."}`}
                  aria-invalid={errors.price ? true : undefined}
                />
                <FieldError>{errors.price}</FieldError>
              </Field>
              <Field data-invalid={errors.date ? true : undefined}>
                <FieldLabel htmlFor="pos-date">Stan na</FieldLabel>
                <Input
                  id="pos-date"
                  type="date"
                  max={todayIso()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  aria-invalid={errors.date ? true : undefined}
                  className="tabular-nums"
                />
                <FieldError>{errors.date}</FieldError>
              </Field>
            </div>
            {taxAccount && (
              <Field data-invalid={errors.deposits ? true : undefined} className="sm:max-w-xs">
                <FieldLabel htmlFor="pos-deposits">Wpłaty na to konto w tym roku</FieldLabel>
                <MoneyInput
                  id="pos-deposits"
                  value={deposits}
                  onChange={setDeposits}
                  placeholder="0"
                  aria-invalid={errors.deposits ? true : undefined}
                />
                <FieldDescription>
                  Liczą się do rocznego limitu{" "}
                  {account?.wrapper.startsWith("IKZE") ? "IKZE" : "IKE"}; puste, jeśli w tym roku
                  nic nie wpłacono.
                </FieldDescription>
                <FieldError>{errors.deposits}</FieldError>
              </Field>
            )}
          </FieldGroup>

          <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Koszt zakupu</dt>
              <dd className="font-medium tabular-nums">
                {costMinor !== null ? formatMoney(money(costMinor, currency)) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                Wartość{quoteApplies ? ` · ${formatIsoDate(lastQuote.date)}` : ""}
              </dt>
              <dd className="font-medium tabular-nums">
                {valueMinor !== null ? formatPln(valueMinor) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Zysk</dt>
              <dd
                className={cn(
                  "font-medium tabular-nums",
                  gainMinor !== null && gainMinor > 0n && "text-primary",
                  gainMinor !== null && gainMinor < 0n && "text-destructive",
                )}
              >
                {gainMinor !== null ? `${gainMinor > 0n ? "+" : ""}${formatPln(gainMinor)}` : "—"}
              </dd>
            </div>
          </dl>

          {add.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się dodać pozycji</AlertTitle>
              <AlertDescription>{add.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Spinner />}
              Dodaj pozycję
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
