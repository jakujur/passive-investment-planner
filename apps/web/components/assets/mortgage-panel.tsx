"use client";

import type { RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Landmark, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { type MortgageTermsErrors, MortgageTermsFields } from "@/components/assets/mortgage-fields";
import { MortgageChart } from "@/components/charts/mortgage-chart";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  bpToInput,
  formatBp,
  formatIsoDate,
  formatPln,
  MONEY_FORMAT_HINT,
  moneyToInput,
  readMoney,
  readPercentBp,
  todayIso,
} from "@/lib/format";
import {
  formatMonthShort,
  type MortgageTermsDraft,
  readKnownTerm,
  resolveMortgageTerms,
} from "@/lib/mortgage";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export type MortgageDetail = RouterOutputs["realEstate"]["mortgageDetail"];
type Entry = MortgageDetail["entries"][number];

const KIND_LABEL: Record<Entry["kind"], string> = {
  BANK: "Stan z banku",
  INSTALLMENT: "Rata",
  OVERPAYMENT: "Nadpłata",
};

/** Bank-statement update plus the expandable balance chart and credit history of one mortgage. */
export function MortgagePanel({
  propertyId,
  propertyName,
  detail,
}: {
  propertyId: string;
  propertyName: string;
  detail: MortgageDetail;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BankUpdateDialog propertyId={propertyId} propertyName={propertyName} detail={detail} />
        <span className="text-xs text-muted-foreground tabular-nums">
          odsetki zapłacone {formatPln(detail.paidInterestMinor)} · do zapłaty{" "}
          {formatPln(detail.projectedInterestMinor)}
        </span>
      </div>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
          Saldo i historia kredytu ({detail.entries.length})
        </summary>
        <div className="mt-3 flex flex-col gap-4">
          {detail.balance.length > 1 ? (
            <MortgageChart balance={detail.balance} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Wykres pojawi się po pierwszej zaksięgowanej racie.
            </p>
          )}
          <ol className="border-t border-border">
            {detail.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 border-b border-border py-2 text-sm"
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tabular-nums">{formatIsoDate(entry.date)}</span>
                  <Badge variant={entry.kind === "BANK" ? "secondary" : "default"}>
                    {KIND_LABEL[entry.kind]}
                  </Badge>
                  <span className="ml-auto font-medium tabular-nums">
                    {entry.amountMinor === null ? "" : formatPln(entry.amountMinor)}
                  </span>
                  {entry.kind === "BANK" && <DeleteEntryButton entry={entry} />}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {entry.kind !== "BANK" && (
                    <>
                      odsetki {formatPln(entry.interestMinor ?? 0n)} · kapitał{" "}
                      {formatPln(entry.principalMinor ?? 0n)}
                      {entry.interestSavedMinor !== null && entry.interestSavedMinor > 0n
                        ? ` · zaoszczędzone odsetki ${formatPln(entry.interestSavedMinor)}`
                        : ""}
                      {" · "}
                    </>
                  )}
                  saldo po: {formatPln(entry.balanceAfterMinor)} · rata:{" "}
                  {formatPln(entry.installmentMinor)}
                  {" · "}
                  {formatBp(entry.rateBp, 2)}
                  {entry.endMonth ? ` · do ${formatMonthShort(entry.endMonth)}` : ""}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </details>
    </div>
  );
}

function DeleteEntryButton({ entry }: { entry: Entry }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useMutation(
    trpc.realEstate.deleteMortgageEntry.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Usuń stan z banku z ${formatIsoDate(entry.date)}`}
          />
        }
      >
        <Trash2 />
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć stan z banku z {formatIsoDate(entry.date)}?</AlertDialogTitle>
          <AlertDialogDescription>
            Saldo i rata wrócą do poprzedniego stanu; raty i nadpłaty z planu zostaną przeliczone.
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
            disabled={remove.isPending}
            onClick={() => remove.mutate({ entryId: entry.id })}
          >
            {remove.isPending && <Spinner />}
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function BankUpdateDialog({
  propertyId,
  propertyName,
  detail,
}: {
  propertyId: string;
  propertyName: string;
  detail: MortgageDetail;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(todayIso());
  const [draft, setDraft] = useState<MortgageTermsDraft>(() => initialDraft(detail));
  const [errors, setErrors] = useState<MortgageTermsErrors & { date?: string }>({});
  const update = useMutation(
    trpc.realEstate.updateMortgageFromBank.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const prefix = `bank-${propertyId}`;
  const stateMonth = date.slice(0, 7);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDate(todayIso());
      setDraft(initialDraft(detail));
      setErrors({});
      update.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) next.date = "Podaj datę wyciągu.";
    const balance = readMoney(draft.balance);
    const rateBp = readPercentBp(draft.rate);
    if (balance === null || balance < 0n) next.balance = MONEY_FORMAT_HINT;
    if (rateBp === null || rateBp < 0 || rateBp > 5000)
      next.rate = "Podaj oprocentowanie w %, np. 7,5.";
    const known = readKnownTerm(draft);
    if (!known.ok) next[known.field] = known.message;
    const terms = resolveMortgageTerms(draft, stateMonth);
    if (!terms.ok && terms.reason === "uncovered")
      next.installment = "Taka rata nie pokrywa odsetek.";
    setErrors(next);
    if (Object.keys(next).length > 0 || balance === null || rateBp === null || !known.ok) return;
    update.mutate({
      propertyId,
      date,
      balanceMinor: balance,
      rateBp,
      installmentMinor: known.installmentMinor,
      endMonth: known.endMonth,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>
        <Landmark data-icon="inline-start" />
        Aktualizuj z banku
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Stan z banku: {propertyName}</DialogTitle>
            <DialogDescription>
              Przepisz z wyciągu stan po racie z danego miesiąca — stanie się aktualnym stanem
              kredytu, a kolejne raty i nadpłaty policzą się od niego.
            </DialogDescription>
          </DialogHeader>
          <Field data-invalid={errors.date ? true : undefined} className="sm:max-w-xs">
            <FieldLabel htmlFor={`${prefix}-date`}>Data wyciągu</FieldLabel>
            <Input
              id={`${prefix}-date`}
              type="date"
              max={todayIso()}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.date ? true : undefined}
              className="tabular-nums"
            />
            <FieldError>{errors.date}</FieldError>
          </Field>
          <MortgageTermsFields
            prefix={prefix}
            draft={draft}
            errors={errors}
            set={(key, value) => setDraft((d) => ({ ...d, [key]: value }))}
            stateMonth={stateMonth}
            balanceHint={`Saldo i rata po zapłaceniu raty za ${formatMonthShort(stateMonth)} (jak na wyciągu).`}
          />
          {update.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać</AlertTitle>
              <AlertDescription>{update.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Spinner />}
              Zapisz stan
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initialDraft(detail: MortgageDetail): MortgageTermsDraft {
  return {
    balance: moneyToInput(detail.mortgage.balanceMinor),
    rate: bpToInput(detail.mortgage.rateBp),
    installmentType: detail.mortgage.installmentType,
    known: "INSTALLMENT",
    installment: moneyToInput(detail.mortgage.installmentMinor),
    endMonth: detail.mortgage.endMonth ?? "",
  };
}

export function MortgageSummary({
  detail,
  className,
}: {
  detail: MortgageDetail;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-2 gap-x-4 gap-y-2 text-sm", className)}>
      <div>
        <dt className="text-xs text-muted-foreground">Saldo kredytu</dt>
        <dd className="font-medium tabular-nums">{formatPln(detail.mortgage.balanceMinor)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">
          Rata · {formatBp(detail.mortgage.rateBp, 2)}
        </dt>
        <dd className="font-medium tabular-nums">{formatPln(detail.mortgage.installmentMinor)}</dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Spłata</dt>
        <dd className="font-medium tabular-nums">
          {detail.payoffMonth
            ? `${formatMonthShort(detail.payoffMonth)} · ${detail.monthsLeft} rat`
            : "spłacony"}
        </dd>
      </div>
      <div>
        <dt className="text-xs text-muted-foreground">Zaoszczędzone odsetki</dt>
        <dd
          className={cn(
            "font-medium tabular-nums",
            detail.interestSavedMinor > 0n ? "text-primary" : "text-muted-foreground",
          )}
        >
          {formatPln(detail.interestSavedMinor)}
        </dd>
      </div>
    </dl>
  );
}
