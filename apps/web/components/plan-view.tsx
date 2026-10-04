"use client";

import type { RouterOutputs } from "@pip/api";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookCheck, Settings2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { PageHeader } from "@/components/page-header";
import { PlanResult } from "@/components/plan-result";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDayMonth, formatMonth, formatPln, MONEY_FORMAT_HINT, readMoney } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Current = RouterOutputs["plan"]["current"];
type History = RouterOutputs["plan"]["history"];

export function PlanView({ initial, history }: { initial: Current; history: History }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [extraEnabled, setExtraEnabled] = useState(initial.extraMinor > 0n);
  const [extraRaw, setExtraRaw] = useState("");
  const [extraError, setExtraError] = useState<string | null>(null);
  const [extraMinor, setExtraMinor] = useState(0n);

  const current = useQuery(
    trpc.plan.current.queryOptions(
      { extraMinor },
      { initialData: extraMinor === 0n ? initial : undefined, placeholderData: keepPreviousData },
    ),
  );
  const execute = useMutation(
    trpc.plan.execute.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.plan.pathFilter());
        router.refresh();
      },
    }),
  );

  function applyExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = readMoney(extraRaw);
    if (parsed === null || parsed < 0n) {
      setExtraError(MONEY_FORMAT_HINT);
      return;
    }
    setExtraError(null);
    setExtraMinor(parsed);
  }

  function toggleExtra(enabled: boolean) {
    setExtraEnabled(enabled);
    if (!enabled) {
      setExtraMinor(0n);
      setExtraRaw("");
      setExtraError(null);
    }
  }

  const data = current.data;
  if (!data) return null;
  const done = data.status === "DONE";
  const nothingToBook = data.surplusMinor === 0n;

  return (
    <>
      <PageHeader
        eyebrow={done ? "Księga miesiąca" : "Plan miesiąca"}
        title={formatMonth(data.month)}
        lead={
          done && data.executedAt
            ? `Zaksięgowany ${formatDayMonth(data.executedAt)}. Poniżej wykonane przelewy, tak jak zostały zapisane.`
            : `Stała wpłata ${formatPln(data.monthlyContributionMinor)}. Sprawdź przelewy, wykonaj je u brokerów i zaksięguj miesiąc.`
        }
      />

      {!done && (
        <Card size="sm">
          <CardContent className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <label htmlFor="extra-toggle" className="flex items-center gap-3 text-sm font-medium">
                <Switch id="extra-toggle" checked={extraEnabled} onCheckedChange={toggleExtra} />W
                tym miesiącu wpłacam więcej
              </label>
              {extraMinor > 0n && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  Dodatkowo {formatPln(extraMinor)} — razem {formatPln(data.surplusMinor)}
                </span>
              )}
            </div>
            {extraEnabled && (
              <form
                onSubmit={applyExtra}
                noValidate
                className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6"
              >
                <Field data-invalid={extraError ? true : undefined} className="sm:max-w-xs">
                  <FieldLabel htmlFor="extra">Dodatkowa kwota</FieldLabel>
                  <MoneyInput
                    id="extra"
                    value={extraRaw}
                    onChange={setExtraRaw}
                    placeholder="np. 2 000"
                    aria-invalid={extraError ? true : undefined}
                  />
                  <FieldError>{extraError}</FieldError>
                </Field>
                <Button type="submit" variant="secondary" disabled={current.isFetching}>
                  {current.isFetching && <Spinner />}
                  Przelicz
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {!done && data.monthlyContributionMinor === 0n && extraMinor === 0n && (
        <Alert variant="warning">
          <Settings2 />
          <AlertTitle>Miesięczna wpłata jest ustawiona na 0 zł</AlertTitle>
          <AlertDescription>
            Ustal stałą kwotę w ustawieniach, a plan będzie liczył się sam co miesiąc. Możesz też
            wpłacić jednorazowo, włączając dopłatę powyżej.
          </AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="xs"
              nativeButton={false}
              render={<Link href="/ustawienia" />}
            >
              Ustawienia
            </Button>
          </AlertAction>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{done ? "Zaksięgowane przelewy" : "Przelewy do wykonania"}</CardTitle>
          <CardDescription>
            {done
              ? "Wpłaty i zakupy z tego planu są już w historii transakcji."
              : "Kolejność kont wynika z układu; kwoty w walucie konta."}
          </CardDescription>
        </CardHeader>
        <CardContent
          className={cn("transition-opacity", current.isPlaceholderData && "opacity-60")}
        >
          <PlanResult
            plan={data.plan}
            labels={data.labels}
            amountLabel={done ? "Zaksięgowana wpłata" : "Wpłata"}
            amountHint={
              data.extraMinor > 0n
                ? `${formatPln(data.monthlyContributionMinor)} stałej + ${formatPln(data.extraMinor)} dodatkowo`
                : undefined
            }
          />
        </CardContent>
        {!done && (
          <div className="mx-(--card-spacing) flex flex-col gap-4 border-t border-border pt-(--card-spacing) sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Po wykonaniu przelewów zaksięguj miesiąc — wpłaty i zakupy trafią do historii.
            </p>
            <ExecuteDialog
              month={data.month}
              amount={data.surplusMinor}
              disabled={nothingToBook || current.isFetching}
              pending={execute.isPending}
              error={execute.error?.message ?? null}
              onConfirm={() => execute.mutate({ extraMinor })}
            />
          </div>
        )}
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Historia</CardTitle>
          <CardDescription>Zaksięgowane miesiące.</CardDescription>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Jeszcze żaden miesiąc nie został zaksięgowany.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miesiąc</TableHead>
                  <TableHead className="text-right">Wpłata</TableHead>
                  <TableHead className="text-right">Dodatkowo</TableHead>
                  <TableHead className="text-right">Przeniesione</TableHead>
                  <TableHead className="text-right">Zaksięgowano</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{formatMonth(row.month)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPln(row.surplusMinor)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.extraMinor > 0n ? formatPln(row.extraMinor) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.carryOutMinor > 0n ? formatPln(row.carryOutMinor) : "—"}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground tabular-nums">
                      {row.executedAt ? formatDayMonth(row.executedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function ExecuteDialog({
  month,
  amount,
  disabled,
  pending,
  error,
  onConfirm,
}: {
  month: string;
  amount: bigint;
  disabled: boolean;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger render={<Button size="lg" disabled={disabled || pending} />}>
          {pending ? <Spinner /> : <BookCheck data-icon="inline-start" />}
          Wykonane
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Zaksięgować {formatMonth(month).toLocaleLowerCase("pl-PL")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Plan na {formatPln(amount)} zostanie zapisany jako wykonany: wpłaty i zakupy trafią do
              historii transakcji, a limity IKE/IKZE zostaną zaktualizowane. Tej operacji nie da się
              cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Jeszcze nie</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                onConfirm();
              }}
            >
              Księguję
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
