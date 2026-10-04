"use client";

import type { RouterOutputs } from "@pip/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, RotateCcw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { describeItem, showsPerson } from "@/components/plan-ledger";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import {
  formatMonth,
  formatQuantity,
  MONEY_FORMAT_HINT,
  moneyToInput,
  readMoney,
  SEGMENT_BG,
} from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type HistoryRow = RouterOutputs["plan"]["history"][number];
type BookedMonth = Pick<HistoryRow, "id" | "month" | "date" | "plan" | "labels">;

interface LineDraft {
  index: number;
  amount: string;
  /** `null` for lines without a quantity (cushion, goal, overpayment, gold by value). */
  quantity: string | null;
  unit: string;
  quantityUnit: string;
  wholeUnits: boolean;
  removed: boolean;
}

interface LineErrors {
  amount?: string;
  quantity?: string;
}

function draftLines(month: BookedMonth): LineDraft[] {
  return month.plan.items.map((item, index) => {
    if (item.kind === "BUY") {
      const instrument = month.labels.instruments[item.instrumentId];
      return {
        index,
        amount: moneyToInput(item.accountAmountMinor),
        quantity: item.quantity === null ? null : formatQuantity(item.quantity),
        unit: item.currency === "PLN" ? "zł" : item.currency,
        quantityUnit: instrument.type === "GOLD" ? "g" : "szt.",
        wholeUnits: instrument.type === "BOND",
        removed: false,
      };
    }
    return {
      index,
      amount: moneyToInput(item.amountMinor),
      quantity: null,
      unit: "zł",
      quantityUnit: "",
      wholeUnits: false,
      removed: false,
    };
  });
}

function lastDayOfMonth(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const days = new Date(year ?? 0, monthNumber ?? 1, 0).getDate();
  return `${month}-${String(days).padStart(2, "0")}`;
}

/** "Edytuj": corrects a booked month's amounts, quantities, removed lines and booking date. */
export function EditMonthDialog({ month }: { month: BookedMonth }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(month.date);
  const [lines, setLines] = useState<LineDraft[]>(() => draftLines(month));
  const [errors, setErrors] = useState<Record<number, LineErrors>>({});
  const [dateError, setDateError] = useState<string | null>(null);
  const update = useMutation(
    trpc.plan.updateMonth.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        await queryClient.invalidateQueries(trpc.plan.pathFilter());
        router.refresh();
      },
    }),
  );
  const showPerson = showsPerson(month.labels);
  const rows = month.plan.items.map((item, index) =>
    describeItem(item, index, month.labels, showPerson),
  );
  const firstDay = `${month.month}-01`;
  const lastDay = lastDayOfMonth(month.month);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDate(month.date);
      setLines(draftLines(month));
      setErrors({});
      setDateError(null);
      update.reset();
    }
  }

  function patch(index: number, change: Partial<LineDraft>) {
    setLines((current) => current.map((l) => (l.index === index ? { ...l, ...change } : l)));
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors: Record<number, LineErrors> = {};
    const payload: { index: number; amountMinor: bigint; quantity: string | null }[] = [];
    for (const line of lines) {
      if (line.removed) continue;
      const lineErrors: LineErrors = {};
      const amountMinor = readMoney(line.amount);
      if (amountMinor === null || amountMinor < 1n) {
        lineErrors.amount =
          amountMinor === null
            ? MONEY_FORMAT_HINT
            : "Kwota musi być większa od zera — albo usuń pozycję.";
      }
      let quantity: string | null = null;
      if (line.quantity !== null) {
        quantity = line.quantity.trim().replace(",", ".");
        if (line.wholeUnits ? !/^\d+$/.test(quantity) : !/^\d+(\.\d{1,8})?$/.test(quantity)) {
          lineErrors.quantity = line.wholeUnits ? "Całe sztuki, np. 23." : "Ilość, np. 8,7617.";
        } else if (Number(quantity) === 0) {
          lineErrors.quantity = "Ilość musi być większa od zera — albo usuń pozycję.";
        }
      }
      if (lineErrors.amount || lineErrors.quantity) nextErrors[line.index] = lineErrors;
      else if (amountMinor !== null) payload.push({ index: line.index, amountMinor, quantity });
    }
    const dateOk = date >= firstDay && date <= lastDay;
    setDateError(
      dateOk
        ? null
        : `Data musi być w miesiącu ${formatMonth(month.month).toLocaleLowerCase("pl-PL")}.`,
    );
    setErrors(nextErrors);
    if (!dateOk || Object.keys(nextErrors).length > 0) return;
    update.mutate({ planId: month.id, date, lines: payload });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="xs" />}>
        <Pencil data-icon="inline-start" />
        Edytuj
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle className="pr-8">Edycja: {formatMonth(month.month)}</DialogTitle>
            <DialogDescription>
              Popraw kwoty i ilości do tego, co naprawdę zostało wykonane; usunięte pozycje znikną z
              księgi. Transakcje tego miesiąca zostaną zapisane od nowa.
            </DialogDescription>
          </DialogHeader>

          <Field data-invalid={dateError ? true : undefined} className="sm:max-w-xs">
            <FieldLabel htmlFor={`edit-${month.id}-date`}>Data księgowania</FieldLabel>
            <Input
              id={`edit-${month.id}-date`}
              type="date"
              min={firstDay}
              max={lastDay}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={dateError ? true : undefined}
              className="tabular-nums"
            />
            <FieldDescription>Dzień, w którym wykonano przelewy i zakupy.</FieldDescription>
            <FieldError>{dateError}</FieldError>
          </Field>

          <ol className="border-t border-border">
            {lines.map((line) => {
              const row = rows[line.index];
              if (!row) return null;
              const lineErrors = errors[line.index] ?? {};
              const prefix = `edit-${month.id}-${line.index}`;
              return (
                <li
                  key={line.index}
                  className={cn(
                    "flex flex-col gap-2 border-b border-border py-3 sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_8rem_auto] sm:items-start sm:gap-x-4",
                    line.removed && "opacity-60",
                  )}
                >
                  <div className="flex min-w-0 flex-col gap-0.5 pt-2">
                    <span className="flex items-baseline gap-2">
                      <span
                        aria-hidden
                        className={cn("size-2 shrink-0 self-center", SEGMENT_BG[row.tone])}
                      />
                      <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {row.kind}
                      </span>
                      <span className={cn("text-sm font-medium", line.removed && "line-through")}>
                        {row.account}
                      </span>
                    </span>
                    {row.detail && (
                      <span className="pl-4 text-xs text-muted-foreground">
                        {line.removed ? "pozycja do usunięcia" : row.detail}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2 sm:contents">
                    <Field data-invalid={lineErrors.amount ? true : undefined} className="gap-1">
                      <FieldLabel htmlFor={`${prefix}-amount`} className="sr-only">
                        Kwota: {row.account}
                      </FieldLabel>
                      <MoneyInput
                        id={`${prefix}-amount`}
                        value={line.amount}
                        onChange={(v) => patch(line.index, { amount: v })}
                        unit={line.unit}
                        disabled={line.removed}
                        aria-invalid={lineErrors.amount ? true : undefined}
                      />
                      <FieldError>{lineErrors.amount}</FieldError>
                    </Field>
                    {line.quantity !== null ? (
                      <Field
                        data-invalid={lineErrors.quantity ? true : undefined}
                        className="gap-1"
                      >
                        <FieldLabel htmlFor={`${prefix}-quantity`} className="sr-only">
                          Ilość: {row.account}
                        </FieldLabel>
                        <InputGroup>
                          <InputGroupInput
                            id={`${prefix}-quantity`}
                            inputMode={line.wholeUnits ? "numeric" : "decimal"}
                            value={line.quantity}
                            onChange={(e) => patch(line.index, { quantity: e.target.value })}
                            disabled={line.removed}
                            aria-invalid={lineErrors.quantity ? true : undefined}
                            className="tabular-nums"
                          />
                          <InputGroupAddon align="inline-end">{line.quantityUnit}</InputGroupAddon>
                        </InputGroup>
                        <FieldError>{lineErrors.quantity}</FieldError>
                      </Field>
                    ) : (
                      <span aria-hidden className="hidden sm:block" />
                    )}
                    <div className="flex justify-end sm:pt-0.5">
                      {line.removed ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => patch(line.index, { removed: false })}
                        >
                          <RotateCcw data-icon="inline-start" />
                          Przywróć
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Usuń pozycję: ${row.account}`}
                          onClick={() => patch(line.index, { removed: true })}
                        >
                          <X />
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

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
              Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
