"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";
import superjson from "superjson";
import { MoneyInput } from "@/components/money-input";
import { PlanResult } from "@/components/plan-result";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { MONEY_FORMAT_HINT, readMoney } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export function PlanPanel({ monthLabel }: { monthLabel: string }) {
  const trpc = useTRPC();
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [surplusMinor, setSurplusMinor] = useState<bigint | null>(null);

  const preview = useQuery(
    trpc.plan.preview.queryOptions(
      { surplusMinor: surplusMinor ?? 0n },
      {
        enabled: surplusMinor !== null,
        placeholderData: keepPreviousData,
        // The default hash is JSON.stringify, which cannot handle the bigint input.
        queryKeyHashFn: superjson.stringify,
      },
    ),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = readMoney(raw);
    if (parsed === null || parsed < 0n) {
      setError(MONEY_FORMAT_HINT);
      return;
    }
    setError(null);
    setSurplusMinor(parsed);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan na {monthLabel}</CardTitle>
        <CardDescription>
          Wpisz nadwyżkę, a plan rozpisze ją na poduszkę, cel i konta — w kolejności z układu.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-10">
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6"
        >
          <Field data-invalid={error ? true : undefined} className="sm:max-w-xs">
            <FieldLabel htmlFor="surplus">Nadwyżka w tym miesiącu</FieldLabel>
            <MoneyInput
              id="surplus"
              value={raw}
              onChange={setRaw}
              placeholder="10 000"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "surplus-error" : undefined}
            />
            <FieldError id="surplus-error">{error}</FieldError>
          </Field>
          <Button type="submit" disabled={preview.isFetching}>
            {preview.isFetching && <Spinner />}
            Zaplanuj
          </Button>
        </form>

        {surplusMinor === null && (
          <p className="border-t border-border pt-6 text-sm text-muted-foreground">
            Jeszcze nic nie zaplanowano. Po wpisaniu kwoty zobaczysz listę przelewów, uzasadnienie i
            ostrzeżenia.
          </p>
        )}

        {preview.isPending && surplusMinor !== null && (
          <div aria-busy className="flex flex-col gap-4 border-t border-border pt-6">
            <Skeleton className="h-12 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {preview.isError && (
          <Alert variant="destructive">
            <AlertTitle>Nie udało się przygotować planu</AlertTitle>
            <AlertDescription>{preview.error.message}</AlertDescription>
          </Alert>
        )}

        {preview.data && (
          <div
            className={cn(
              "border-t border-border pt-8 transition-opacity",
              preview.isPlaceholderData && "opacity-60",
            )}
          >
            <PlanResult plan={preview.data.plan} labels={preview.data.labels} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
