"use client";

import type { RouterOutputs } from "@pip/api";
import { formatMoney, money } from "@pip/money";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatIsoDate,
  formatQuantity,
  MONEY_FORMAT_HINT,
  readMoney,
  todayIso,
} from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type Transaction = RouterOutputs["transactions"]["list"][number];
type Instrument = RouterOutputs["instruments"]["list"][number];

export interface AccountOption {
  id: string;
  name: string;
  broker: string;
  currency: Transaction["currency"];
  personName: string;
  inQueue: boolean;
}

const TYPE_LABEL: Record<Transaction["type"], string> = {
  BUY: "Zakup",
  DEPOSIT: "Wpłata",
  FEE: "Opłata",
  INTEREST: "Odsetki",
};
const SOURCE_LABEL: Record<Transaction["source"], string> = {
  MANUAL: "Ręcznie",
  IMPORT: "Import",
  PLAN: "Plan",
};

const BOND_UNIT_MINOR = 10_000n;

export function TransactionsTable({
  transactions,
  showPerson,
}: {
  transactions: Transaction[];
  showPerson: boolean;
}) {
  if (transactions.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Brak transakcji. Pojawią się tu po zaksięgowaniu planu albo po ręcznym dodaniu zakupu.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Rodzaj</TableHead>
          <TableHead>Konto</TableHead>
          <TableHead>Instrument</TableHead>
          <TableHead className="text-right">Ilość</TableHead>
          <TableHead className="text-right">Kwota</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((t) => (
          <TableRow key={t.id}>
            <TableCell className="tabular-nums whitespace-nowrap">
              {formatIsoDate(t.date)}
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2">
                {TYPE_LABEL[t.type]}
                <Badge variant="secondary">{SOURCE_LABEL[t.source]}</Badge>
              </span>
            </TableCell>
            <TableCell>
              {t.accountName}
              {showPerson && <span className="text-muted-foreground"> · {t.personName}</span>}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {t.instrumentName
                ? `${t.instrumentName}${t.instrumentTicker ? ` (${t.instrumentTicker})` : ""}`
                : "—"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {t.quantity ? formatQuantity(t.quantity) : "—"}
            </TableCell>
            <TableCell className="text-right font-medium tabular-nums whitespace-nowrap">
              {formatMoney(money(t.amountMinor, t.currency))}
            </TableCell>
            <TableCell>{t.source === "MANUAL" && <DeleteTransactionButton id={t.id} />}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function DeleteTransactionButton({ id }: { id: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useMutation(
    trpc.transactions.delete.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label="Usuń transakcję" />}
        disabled={remove.isPending}
      >
        {remove.isPending ? <Spinner /> : <Trash2 />}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć transakcję?</AlertDialogTitle>
          <AlertDialogDescription>
            Zniknie z historii, a wartość pozycji i limity przeliczą się od nowa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {remove.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Zostaw</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              remove.mutate({ id });
            }}
          >
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface Errors {
  accountId?: string;
  date?: string;
  instrumentId?: string;
  quantity?: string;
  amount?: string;
}

export function AddTransactionDialog({
  accounts,
  instruments,
  defaultInstrumentId,
  bonds,
}: {
  accounts: AccountOption[];
  instruments: Instrument[];
  defaultInstrumentId: string | null;
  bonds: boolean;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const queueAccounts = accounts.filter((a) => a.inQueue);
  const otherAccounts = accounts.filter((a) => !a.inQueue);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [date, setDate] = useState(todayIso());
  const [instrumentId, setInstrumentId] = useState(defaultInstrumentId ?? instruments[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [alsoDeposit, setAlsoDeposit] = useState(true);
  const [errors, setErrors] = useState<Errors>({});
  const account = accounts.find((a) => a.id === accountId) ?? null;
  const showPerson = new Set(accounts.map((a) => a.personName)).size > 1;

  const create = useMutation(
    trpc.transactions.create.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setQuantity("");
        setAmount("");
        setAmountTouched(false);
        router.refresh();
      },
    }),
  );

  function onQuantityChange(value: string) {
    setQuantity(value);
    if (bonds && !amountTouched && /^\d+$/.test(value)) {
      const units = BigInt(value) * BOND_UNIT_MINOR;
      setAmount(formatMoney(money(units)).replace(/\s?zł$/, ""));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    if (!accountId) next.accountId = "Wybierz konto.";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Podaj datę.";
    else if (date > todayIso()) next.date = "Data nie może być z przyszłości.";
    if (!instrumentId) next.instrumentId = "Wybierz instrument.";
    const quantityOk = bonds
      ? /^\d+$/.test(quantity) && quantity !== "0"
      : /^\d+(\.\d{1,8})?$/.test(quantity.replace(",", "."));
    if (!quantityOk) {
      next.quantity = bonds
        ? "Podaj liczbę całych sztuk."
        : "Podaj ilość, np. 12.5 (do 8 miejsc po kropce).";
    }
    const amountMinor = readMoney(amount);
    if (amountMinor === null || amountMinor < 1n) next.amount = MONEY_FORMAT_HINT;
    setErrors(next);
    if (Object.keys(next).length > 0 || amountMinor === null) return;
    create.mutate({
      accountId,
      type: "BUY",
      date,
      instrumentId,
      quantity: quantity.replace(",", "."),
      amountMinor,
      alsoDeposit,
    });
  }

  const accountOption = (a: AccountOption) => (
    <NativeSelectOption key={a.id} value={a.id}>
      {a.name} · {a.broker}
      {showPerson ? ` · ${a.personName}` : ""} ({a.currency})
    </NativeSelectOption>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <Plus data-icon="inline-start" />
        Dodaj zakup
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{bonds ? "Zakup obligacji" : "Zakup ręczny"}</DialogTitle>
            <DialogDescription>
              {bonds
                ? "EDO kupuje się w całych sztukach po 100 zł; data może być wsteczna."
                : "Zakup spoza planu, na przykład z historii u brokera; data może być wsteczna."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-6">
            <Field data-invalid={errors.accountId ? true : undefined}>
              <FieldLabel htmlFor="tx-account">Konto</FieldLabel>
              <NativeSelect
                id="tx-account"
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
                aria-invalid={errors.accountId ? true : undefined}
              >
                {queueAccounts.length > 0 && otherAccounts.length > 0 ? (
                  <>
                    <NativeSelectOptGroup label="Kolejka tej klasy">
                      {queueAccounts.map(accountOption)}
                    </NativeSelectOptGroup>
                    <NativeSelectOptGroup label="Pozostałe konta">
                      {otherAccounts.map(accountOption)}
                    </NativeSelectOptGroup>
                  </>
                ) : (
                  accounts.map(accountOption)
                )}
              </NativeSelect>
              <FieldError>{errors.accountId}</FieldError>
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={errors.date ? true : undefined}>
                <FieldLabel htmlFor="tx-date">Data</FieldLabel>
                <Input
                  id="tx-date"
                  type="date"
                  max={todayIso()}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                  aria-invalid={errors.date ? true : undefined}
                  className="tabular-nums"
                />
                <FieldError>{errors.date}</FieldError>
              </Field>
              <Field data-invalid={errors.instrumentId ? true : undefined}>
                <FieldLabel htmlFor="tx-instrument">Instrument</FieldLabel>
                <NativeSelect
                  id="tx-instrument"
                  value={instrumentId}
                  onChange={(event) => setInstrumentId(event.target.value)}
                  aria-invalid={errors.instrumentId ? true : undefined}
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
              <Field data-invalid={errors.quantity ? true : undefined}>
                <FieldLabel htmlFor="tx-quantity">{bonds ? "Sztuk" : "Ilość"}</FieldLabel>
                <Input
                  id="tx-quantity"
                  inputMode={bonds ? "numeric" : "decimal"}
                  autoComplete="off"
                  value={quantity}
                  onChange={(event) => onQuantityChange(event.target.value)}
                  placeholder={bonds ? "np. 25" : "np. 12.5"}
                  aria-invalid={errors.quantity ? true : undefined}
                  className="tabular-nums"
                />
                <FieldError>{errors.quantity}</FieldError>
              </Field>
              <Field data-invalid={errors.amount ? true : undefined}>
                <FieldLabel htmlFor="tx-amount">Kwota</FieldLabel>
                <MoneyInput
                  id="tx-amount"
                  unit={account?.currency ?? "PLN"}
                  value={amount}
                  onChange={(value) => {
                    setAmount(value);
                    setAmountTouched(true);
                  }}
                  aria-invalid={errors.amount ? true : undefined}
                />
                <FieldDescription>W walucie konta, razem z prowizją.</FieldDescription>
                <FieldError>{errors.amount}</FieldError>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox id="tx-deposit" checked={alsoDeposit} onCheckedChange={setAlsoDeposit} />
              <FieldContent>
                <FieldLabel htmlFor="tx-deposit">Wpłata na konto</FieldLabel>
                <FieldDescription>
                  Zapisz też wpłatę tej kwoty na konto — liczy się do limitu IKE/IKZE.
                </FieldDescription>
              </FieldContent>
            </Field>
          </FieldGroup>
          {create.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się dodać transakcji</AlertTitle>
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
