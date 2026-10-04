"use client";

import type { RouterOutputs } from "@pip/api";
import {
  BOND_NOMINAL_MINOR,
  type BondTicker,
  bondPurchaseDate,
  bondTermLabel,
  parseBondSeries,
} from "@pip/api/bonds";
import { useMutation } from "@tanstack/react-query";
import { Plus, TableProperties, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { formatIsoDate, formatPln } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "BONDS" }>;
type QueueAccount = Overview["queue"][number];

interface RowDraft {
  key: number;
  series: string;
  units: string;
  maturityDate: string;
  /** Once the user edits the day, a new series code no longer resets it. */
  dateTouched: boolean;
}

interface RowErrors {
  series?: string;
  units?: string;
  maturityDate?: string;
  api?: string;
}

interface RowView {
  parsed: { ticker: BondTicker; maturityMonth: string } | null;
  units: number | null;
  nominalMinor: bigint;
  purchaseDate: string | null;
}

function emptyRow(key: number): RowDraft {
  return { key, series: "", units: "", maturityDate: "", dateTouched: false };
}

function viewRow(row: RowDraft): RowView {
  const parsed = parseBondSeries(row.series);
  const units = /^\d+$/.test(row.units.trim()) ? Number(row.units) : null;
  const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(row.maturityDate);
  return {
    parsed,
    units,
    nominalMinor: units === null ? 0n : BigInt(units) * BOND_NOMINAL_MINOR,
    purchaseDate: parsed && dateOk ? bondPurchaseDate(parsed.ticker, row.maturityDate) : null,
  };
}

/** Bond holdings typed like the bond-service statement: series code, count and redemption day per row. */
export function AddBondsDialog({ accounts }: { accounts: QueueAccount[] }) {
  const trpc = useTRPC();
  const router = useRouter();
  const idPrefix = useId();
  const [open, setOpen] = useState(false);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [rows, setRows] = useState<RowDraft[]>(() => [emptyRow(0), emptyRow(1), emptyRow(2)]);
  const [nextKey, setNextKey] = useState(3);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, RowErrors>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const add = useMutation(
    trpc.transactions.addBonds.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
      onError: (error) => {
        const match = /^Wiersz (\d+): (.*)$/s.exec(error.message);
        const index = match ? Number(match[1]) - 1 : -1;
        const filled = rows.filter((r) => r.series.trim() !== "" || r.units.trim() !== "");
        const target = filled[index];
        if (match && target) {
          setErrors({ [target.key]: { api: match[2] } });
          setFormError(null);
        } else {
          setFormError(error.message);
        }
      },
    }),
  );

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setRows([emptyRow(0), emptyRow(1), emptyRow(2)]);
      setNextKey(3);
      setErrors({});
      setFormError(null);
      add.reset();
    }
  }

  function patch(key: number, change: Partial<RowDraft>) {
    setRows((current) => current.map((r) => (r.key === key ? { ...r, ...change } : r)));
  }

  function setSeries(row: RowDraft, raw: string) {
    const series = raw.toUpperCase();
    const parsed = parseBondSeries(series);
    patch(row.key, {
      series,
      ...(parsed && !row.dateTouched ? { maturityDate: `${parsed.maturityMonth}-01` } : {}),
    });
  }

  function addRow() {
    setRows((current) => [...current, emptyRow(nextKey)]);
    setFocusKey(nextKey);
    setNextKey((k) => k + 1);
  }

  function removeRow(key: number) {
    setRows((current) => (current.length === 1 ? current : current.filter((r) => r.key !== key)));
  }

  function onRowKeyDown(event: KeyboardEvent<HTMLInputElement>, row: RowDraft) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (rows[rows.length - 1]?.key === row.key) addRow();
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const filled = rows.filter((r) => r.series.trim() !== "" || r.units.trim() !== "");
    const nextErrors: Record<number, RowErrors> = {};
    const payload: { series: string; units: number; maturityDate: string | null }[] = [];
    for (const row of filled) {
      const view = viewRow(row);
      const rowErrors: RowErrors = {};
      if (!view.parsed) rowErrors.series = "Nieznany kod serii, np. ROD0338.";
      if (view.units === null || view.units < 1) rowErrors.units = "Podaj liczbę sztuk.";
      const date = row.maturityDate.trim();
      if (date !== "" && view.parsed && !date.startsWith(view.parsed.maturityMonth)) {
        rowErrors.maturityDate = `Wykup musi być w ${view.parsed.maturityMonth.slice(5)}.${view.parsed.maturityMonth.slice(0, 4)}.`;
      }
      if (Object.keys(rowErrors).length > 0) nextErrors[row.key] = rowErrors;
      else if (view.parsed && view.units !== null) {
        payload.push({
          series: row.series.trim().toUpperCase(),
          units: view.units,
          maturityDate: date || null,
        });
      }
    }
    if (!accountId) setFormError("Wybierz konto.");
    else if (payload.length === 0 && Object.keys(nextErrors).length === 0)
      setFormError("Wpisz przynajmniej jedną serię.");
    else setFormError(null);
    setErrors(nextErrors);
    if (!accountId || Object.keys(nextErrors).length > 0 || payload.length === 0) return;
    add.mutate({ accountId, rows: payload });
  }

  const views = rows.map((row) => viewRow(row));
  const totalUnits = views.reduce((sum, v) => sum + (v.units ?? 0), 0);
  const totalNominal = views.reduce((sum, v) => sum + v.nominalMinor, 0n);
  const showPerson = new Set(accounts.map((a) => a.personName)).size > 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <TableProperties data-icon="inline-start" />
        Dodaj posiadane obligacje
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-3xl">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Stan rachunku rejestrowego</DialogTitle>
            <DialogDescription>
              Przepisz wiersze z serwisu obligacji: emisja i liczba sztuk; datę wykupu podpowiadamy
              z kodu serii, datę zakupu liczymy z terminu. Enter w ostatnim wierszu dodaje kolejny.
            </DialogDescription>
          </DialogHeader>

          <Field className="sm:max-w-sm">
            <FieldLabel htmlFor={`${idPrefix}-account`}>Konto</FieldLabel>
            <NativeSelect
              id={`${idPrefix}-account`}
              className="w-full"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <NativeSelectOption key={a.id} value={a.id}>
                  {a.name} · {a.broker}
                  {showPerson ? ` · ${a.personName}` : ""}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <p className="text-xs text-muted-foreground sm:hidden">Tabela przewija się w bok.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-2xl text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  <th className="w-8 py-2 pr-2 font-semibold">#</th>
                  <th className="py-2 pr-3 font-semibold">Emisja</th>
                  <th className="py-2 pr-3 text-right font-semibold">Liczba obligacji</th>
                  <th className="py-2 pr-3 text-right font-semibold">Wartość nominalna</th>
                  <th className="py-2 pr-3 font-semibold">Data wykupu</th>
                  <th className="py-2 pr-3 font-semibold">Data zakupu</th>
                  <th className="w-8 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => {
                  const view = views[index];
                  const rowErrors = errors[row.key] ?? {};
                  const hasError = Object.keys(rowErrors).length > 0;
                  const seriesHint =
                    view?.parsed !== null && view?.parsed !== undefined
                      ? `${view.parsed.ticker} · ${bondTermLabel(view.parsed.ticker)}`
                      : row.series.length >= 7
                        ? "nieznany kod"
                        : "";
                  return (
                    <tr
                      key={row.key}
                      className={cn(
                        "border-b border-border align-top",
                        hasError && "bg-destructive/5",
                      )}
                    >
                      <td className="py-2 pr-2 font-heading text-muted-foreground tabular-nums">
                        {index + 1}.
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          aria-label={`Emisja, wiersz ${index + 1}`}
                          value={row.series}
                          onChange={(e) => setSeries(row, e.target.value)}
                          onKeyDown={(e) => onRowKeyDown(e, row)}
                          placeholder="ROD0338"
                          maxLength={7}
                          autoCapitalize="characters"
                          autoFocus={focusKey === row.key}
                          aria-invalid={rowErrors.series ? true : undefined}
                          className="w-28 uppercase tabular-nums"
                        />
                        <span
                          className={cn(
                            "mt-1 block text-xs",
                            view?.parsed ? "text-muted-foreground" : "text-warning",
                          )}
                        >
                          {seriesHint}
                        </span>
                        <FieldError>{rowErrors.series}</FieldError>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <Input
                          aria-label={`Liczba obligacji, wiersz ${index + 1}`}
                          inputMode="numeric"
                          value={row.units}
                          onChange={(e) => patch(row.key, { units: e.target.value })}
                          onKeyDown={(e) => onRowKeyDown(e, row)}
                          aria-invalid={rowErrors.units ? true : undefined}
                          className="w-20 text-right tabular-nums"
                        />
                        <FieldError>{rowErrors.units}</FieldError>
                      </td>
                      <td className="py-2 pr-3 pt-4 text-right text-muted-foreground tabular-nums whitespace-nowrap">
                        {view && view.units !== null ? formatPln(view.nominalMinor) : "—"}
                      </td>
                      <td className="py-2 pr-3">
                        <Input
                          type="date"
                          aria-label={`Data wykupu, wiersz ${index + 1}`}
                          value={row.maturityDate}
                          onChange={(e) =>
                            patch(row.key, { maturityDate: e.target.value, dateTouched: true })
                          }
                          onKeyDown={(e) => onRowKeyDown(e, row)}
                          aria-invalid={rowErrors.maturityDate ? true : undefined}
                          className="w-40 tabular-nums"
                        />
                        <FieldError>{rowErrors.maturityDate}</FieldError>
                      </td>
                      <td className="py-2 pr-3 pt-4 text-muted-foreground tabular-nums whitespace-nowrap">
                        {view?.purchaseDate ? formatIsoDate(view.purchaseDate) : "—"}
                        <FieldError>{rowErrors.api}</FieldError>
                      </td>
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Usuń wiersz ${index + 1}`}
                          disabled={rows.length === 1}
                          onClick={() => removeRow(row.key)}
                        >
                          <X />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="py-2 pr-2" />
                  <td className="py-2 pr-3">Razem</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{totalUnits} szt.</td>
                  <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                    {formatPln(totalNominal)}
                  </td>
                  <td colSpan={3} className="py-2">
                    <Button type="button" variant="ghost" size="xs" onClick={addRow}>
                      <Plus data-icon="inline-start" />
                      Dodaj wiersz
                    </Button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <Spinner />}
              Zapisz obligacje
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
