"use client";

import type { RouterOutputs } from "@pip/api";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { History, RotateCcw, Settings2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ExecuteDialog } from "@/components/execute-dialog";
import { MoneyInput } from "@/components/money-input";
import { PageHeader } from "@/components/page-header";
import { PlanLedger } from "@/components/plan-ledger";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { UndoMonthDialog } from "@/components/undo-month-dialog";
import {
  formatAdjustment,
  formatDayMonth,
  formatMonth,
  formatPln,
  MONEY_FORMAT_HINT,
  moneyToInput,
  readMoney,
} from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Current = RouterOutputs["plan"]["current"];

const SLIDER_STEP_ZL = 100;
const SLIDER_MAX_WITHOUT_CONTRIBUTION_ZL = 20_000;
const RECOMPUTE_DELAY_MS = 300;

/** Slider range: 0 … twice the regular contribution (so it sits in the middle), or a flat ceiling. */
function sliderMaxZl(contributionMinor: bigint): number {
  if (contributionMinor === 0n) return SLIDER_MAX_WITHOUT_CONTRIBUTION_ZL;
  const twice = Number(contributionMinor * 2n) / 100;
  return Math.max(SLIDER_STEP_ZL, Math.ceil(twice / SLIDER_STEP_ZL) * SLIDER_STEP_ZL);
}

export function PlanView({ initial }: { initial: Current }) {
  const trpc = useTRPC();
  const contribution = initial.monthlyContributionMinor;
  const [amountMinor, setAmountMinor] = useState(contribution);
  const [amountRaw, setAmountRaw] = useState(moneyToInput(contribution));
  const [amountError, setAmountError] = useState<string | null>(null);
  const [queriedAdjustment, setQueriedAdjustment] = useState(0n);
  const adjustment = amountMinor - contribution;

  useEffect(() => {
    const timer = setTimeout(() => setQueriedAdjustment(adjustment), RECOMPUTE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [adjustment]);

  const current = useQuery(
    trpc.plan.current.queryOptions(
      { adjustmentMinor: queriedAdjustment },
      {
        initialData: queriedAdjustment === 0n ? initial : undefined,
        placeholderData: keepPreviousData,
      },
    ),
  );

  const data = current.data;
  if (!data) return null;
  const done = data.status === "DONE";
  const maxZl = sliderMaxZl(contribution);
  const sliderZl = Math.max(0, Math.min(maxZl, Math.round(Number(amountMinor) / 100)));
  const centrePercent = Math.min(100, (Number(contribution) / 100 / maxZl) * 100);
  const stale = adjustment !== queriedAdjustment || current.isFetching;

  function setAmount(minor: bigint, raw: string) {
    setAmountMinor(minor);
    setAmountRaw(raw);
    setAmountError(null);
  }

  function setFromInput(raw: string) {
    setAmountRaw(raw);
    const parsed = raw.trim() === "" ? 0n : readMoney(raw);
    if (parsed === null || parsed < 0n) {
      setAmountError(MONEY_FORMAT_HINT);
      return;
    }
    setAmountError(null);
    setAmountMinor(parsed);
  }

  return (
    <>
      <PageHeader
        eyebrow={done ? "Księga miesiąca" : "Plan miesiąca"}
        title={formatMonth(data.month)}
        lead={
          done && data.executedAt
            ? `Zaksięgowany ${formatDayMonth(data.executedAt)} — przelewy tak, jak zostały zapisane.`
            : `Stała wpłata ${formatPln(contribution)}. Wykonaj przelewy u brokerów i zaksięguj miesiąc.`
        }
        actions={
          <>
            <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/profil" />}>
              <History data-icon="inline-start" />
              Historia
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href="/plan/ustawienia" />}
            >
              <Settings2 data-icon="inline-start" />
              Ustawienia planu
            </Button>
          </>
        }
      />

      <Card size="sm">
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-[auto_minmax(0,1fr)] md:items-end md:gap-10">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                {done ? "Zaksięgowana wpłata" : "Wpłata"}
              </span>
              <span className="font-heading text-3xl leading-tight tabular-nums">
                {formatPln(data.surplusMinor)}
              </span>
              {data.adjustmentMinor !== 0n && (
                <span className="text-sm text-muted-foreground tabular-nums">
                  {formatPln(data.monthlyContributionMinor)} stałej, korekta{" "}
                  {formatAdjustment(data.adjustmentMinor)}
                </span>
              )}
            </div>

            {!done && (
              <Field data-invalid={amountError ? true : undefined} className="gap-2 md:max-w-xl">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <FieldLabel htmlFor="amount">W tym miesiącu wpłacam inną kwotę</FieldLabel>
                  <span className="flex items-center gap-2 text-sm tabular-nums">
                    {stale && <Spinner className="size-3.5" />}
                    <span
                      className={cn(
                        adjustment > 0n && "text-primary",
                        adjustment < 0n && "text-warning",
                        adjustment === 0n && "text-muted-foreground",
                      )}
                    >
                      {adjustment === 0n
                        ? "bez korekty"
                        : `korekta ${formatAdjustment(adjustment)}`}
                    </span>
                    {adjustment !== 0n && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setAmount(contribution, moneyToInput(contribution))}
                      >
                        <RotateCcw data-icon="inline-start" />
                        Stała wpłata
                      </Button>
                    )}
                  </span>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="relative py-1.5">
                      <span
                        aria-hidden
                        className="absolute top-1/2 h-3.5 w-px -translate-x-1/2 -translate-y-1/2 bg-foreground/50"
                        style={{ left: `${centrePercent}%` }}
                      />
                      <Slider
                        aria-label="Kwota wpłaty w tym miesiącu"
                        min={0}
                        max={maxZl}
                        step={SLIDER_STEP_ZL}
                        value={[sliderZl]}
                        onValueChange={(value) => {
                          const next = Array.isArray(value) ? value[0] : value;
                          if (next === undefined) return;
                          const minor = BigInt(next) * 100n;
                          setAmount(minor, moneyToInput(minor));
                        }}
                      />
                    </div>
                    <div className="relative h-4 text-xs text-muted-foreground tabular-nums">
                      <span className="absolute left-0">0 zł</span>
                      <span
                        className="absolute -translate-x-1/2 whitespace-nowrap"
                        style={{ left: `${centrePercent}%` }}
                      >
                        stała wpłata
                      </span>
                      <span className="absolute right-0">{formatPln(BigInt(maxZl) * 100n)}</span>
                    </div>
                  </div>
                  <MoneyInput
                    id="amount"
                    value={amountRaw}
                    onChange={setFromInput}
                    aria-invalid={amountError ? true : undefined}
                    className="w-full shrink-0 sm:w-36"
                  />
                </div>
                <FieldError>{amountError}</FieldError>
              </Field>
            )}
          </div>

          {!done && contribution === 0n && amountMinor === 0n && (
            <p className="text-sm text-warning">
              Miesięczna wpłata to 0 zł — ustal stałą kwotę w{" "}
              <Link href="/plan/ustawienia" className="underline underline-offset-4">
                ustawieniach planu
              </Link>{" "}
              albo wpisz kwotę jednorazowo powyżej.
            </p>
          )}

          <PlanLedger
            plan={data.plan}
            labels={data.labels}
            className={cn("transition-opacity", current.isPlaceholderData && "opacity-60")}
          />

          {done && data.id !== null && (
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Pomyłka? Cofnij księgowanie i zaksięguj miesiąc jeszcze raz; kwoty poprawisz w
                historii na stronie profilu.
              </p>
              <UndoMonthDialog planId={data.id} month={data.month} />
            </div>
          )}
          {!done && (
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Po wykonaniu przelewów zaksięguj miesiąc — wpłaty i zakupy trafią do historii.
              </p>
              <ExecuteDialog
                month={data.month}
                amount={data.surplusMinor}
                adjustmentMinor={queriedAdjustment}
                disabled={data.surplusMinor === 0n || stale || amountError !== null}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
