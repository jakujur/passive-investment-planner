"use client";

import type { AssetClassKind } from "@pip/engine";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { CLASS_ORDER, CLASSES } from "@/lib/classes";
import { formatBp } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

type Weights = Record<AssetClassKind, number>;

const TOTAL_BP = 10_000;
const STEP_BP = 50;

/** Sets one class and rescales the others proportionally so the sum stays at 100%. */
function rebalance(weights: Weights, changed: AssetClassKind, valueBp: number): Weights {
  const value = Math.max(0, Math.min(TOTAL_BP, valueBp));
  const others = CLASS_ORDER.filter((k) => k !== changed);
  const othersTotal = others.reduce((sum, k) => sum + weights[k], 0);
  const remaining = TOTAL_BP - value;
  const next: Weights = { ...weights, [changed]: value };
  let assigned = 0;
  for (const k of others) {
    const share =
      othersTotal === 0 ? remaining / others.length : (weights[k] * remaining) / othersTotal;
    next[k] = Math.round(share / STEP_BP) * STEP_BP;
    assigned += next[k];
  }
  const drift = remaining - assigned;
  if (drift !== 0) {
    const largest = others.reduce((a, b) => (next[a] >= next[b] ? a : b));
    next[largest] = Math.max(0, next[largest] + drift);
  }
  return next;
}

const SLIDER_TONE: Record<AssetClassKind, string> = {
  EQUITY:
    "[&_[data-slot=slider-range]]:bg-class-equity [&_[data-slot=slider-thumb]]:bg-class-equity",
  BONDS: "[&_[data-slot=slider-range]]:bg-class-bonds [&_[data-slot=slider-thumb]]:bg-class-bonds",
  REAL_ESTATE:
    "[&_[data-slot=slider-range]]:bg-class-real-estate [&_[data-slot=slider-thumb]]:bg-class-real-estate",
  GOLD: "[&_[data-slot=slider-range]]:bg-class-gold [&_[data-slot=slider-thumb]]:bg-class-gold",
};

export function WeightsForm({ initial }: { initial: Weights }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [weights, setWeights] = useState<Weights>(initial);
  const [saved, setSaved] = useState(false);
  const update = useMutation(
    trpc.settings.updateWeights.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    }),
  );
  const total = CLASS_ORDER.reduce((sum, k) => sum + weights[k], 0);
  const dirty = CLASS_ORDER.some((k) => weights[k] !== initial[k]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (total !== TOTAL_BP) return;
    update.mutate(weights);
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Wagi klas</CardTitle>
          <CardDescription>
            Przesunięcie jednej wagi rozkłada różnicę proporcjonalnie na pozostałe — suma zawsze
            100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-8">
          <div aria-hidden className="flex h-3 w-full gap-px overflow-hidden bg-muted">
            {CLASS_ORDER.map((k) => (
              <div
                key={k}
                className={CLASSES[k].bg}
                style={{ flexBasis: `${weights[k] / 100}%` }}
              />
            ))}
          </div>
          <div className="flex flex-col gap-6">
            {CLASS_ORDER.map((k) => (
              <div key={k} className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor={`weight-${k}`} className="gap-2">
                    <span aria-hidden className={cn("size-2.5", CLASSES[k].bg)} />
                    {CLASSES[k].name}
                  </Label>
                  <span className="font-heading text-xl tabular-nums">{formatBp(weights[k])}</span>
                </div>
                <Slider
                  id={`weight-${k}`}
                  aria-label={`Waga: ${CLASSES[k].name}`}
                  min={0}
                  max={TOTAL_BP}
                  step={STEP_BP}
                  value={[weights[k]]}
                  onValueChange={(value) => {
                    const next = Array.isArray(value) ? value[0] : value;
                    if (next === undefined) return;
                    setSaved(false);
                    setWeights((w) => rebalance(w, k, next));
                  }}
                  className={SLIDER_TONE[k]}
                />
              </div>
            ))}
          </div>
          {update.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać wag</AlertTitle>
              <AlertDescription>{update.error.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
            <span
              className={cn(
                "text-sm tabular-nums",
                total === TOTAL_BP ? "text-muted-foreground" : "text-destructive",
              )}
            >
              Suma {formatBp(total)}
            </span>
            <div className="flex items-center gap-4">
              {saved && !update.isPending && (
                <span role="status" className="text-sm text-primary">
                  Zapisano.
                </span>
              )}
              <Button type="submit" disabled={update.isPending || total !== TOTAL_BP || !dirty}>
                {update.isPending && <Spinner />}
                Zapisz wagi
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
