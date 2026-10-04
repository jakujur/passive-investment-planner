"use client";

import { type AssetClassKind, bandFor } from "@pip/engine";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import { CLASS_ORDER, CLASSES } from "@/lib/classes";
import { bpToInput, formatBand, formatBp, readPercentBp } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export interface ClassWeight {
  weightBp: number;
  toleranceBp: number | null;
}
type Weights = Record<AssetClassKind, number>;
type Tolerances = Record<AssetClassKind, string>;

const TOTAL_BP = 10_000;
const STEP_BP = 50;

function perClass<T>(f: (kind: AssetClassKind) => T): Record<AssetClassKind, T> {
  return { EQUITY: f("EQUITY"), BONDS: f("BONDS"), REAL_ESTATE: f("REAL_ESTATE"), GOLD: f("GOLD") };
}

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

/** Default ± half-width the engine applies when no tolerance is set. */
function defaultToleranceBp(weightBp: number): number {
  const band = bandFor(weightBp);
  return Math.max(band.upperBp - weightBp, weightBp - band.lowerBp);
}

/** `null` = default rule; `undefined` = unparsable. */
function parseTolerance(raw: string): number | null | undefined {
  if (raw.trim() === "") return null;
  const bp = readPercentBp(raw);
  return bp === null || bp < 0 || bp > 5_000 ? undefined : bp;
}

const SLIDER_TONE: Record<AssetClassKind, string> = {
  EQUITY:
    "[&_[data-slot=slider-range]]:bg-class-equity [&_[data-slot=slider-thumb]]:bg-class-equity",
  BONDS: "[&_[data-slot=slider-range]]:bg-class-bonds [&_[data-slot=slider-thumb]]:bg-class-bonds",
  REAL_ESTATE:
    "[&_[data-slot=slider-range]]:bg-class-real-estate [&_[data-slot=slider-thumb]]:bg-class-real-estate",
  GOLD: "[&_[data-slot=slider-range]]:bg-class-gold [&_[data-slot=slider-thumb]]:bg-class-gold",
};

export function WeightsForm({ initial }: { initial: Record<AssetClassKind, ClassWeight> }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [weights, setWeights] = useState<Weights>(() => perClass((k) => initial[k].weightBp));
  const [tolerances, setTolerances] = useState<Tolerances>(() =>
    perClass((k) => {
      const tolerance = initial[k].toleranceBp;
      return tolerance === null ? "" : bpToInput(tolerance);
    }),
  );
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
  const parsed = perClass((k) => parseTolerance(tolerances[k]));
  const invalid = CLASS_ORDER.some((k) => parsed[k] === undefined);
  const dirty = CLASS_ORDER.some(
    (k) => weights[k] !== initial[k].weightBp || parsed[k] !== initial[k].toleranceBp,
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (total !== TOTAL_BP || invalid) return;
    update.mutate(perClass((k) => ({ weightBp: weights[k], toleranceBp: parsed[k] ?? null })));
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Wagi i tolerancja udziału</CardTitle>
          <CardDescription>
            Przesunięcie jednej wagi rozkłada różnicę na pozostałe — suma zawsze 100%. Tolerancja to
            dopuszczalne odchylenie udziału w pp; puste pole = domyślne ±5 pp (klasy od 20%) albo
            ±25% wagi.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div aria-hidden className="flex h-2.5 w-full gap-px overflow-hidden bg-muted">
            {CLASS_ORDER.map((k) => (
              <div
                key={k}
                className={CLASSES[k].bg}
                style={{ flexBasis: `${weights[k] / 100}%` }}
              />
            ))}
          </div>
          <div className="grid gap-5 md:grid-cols-2 md:gap-x-10">
            {CLASS_ORDER.map((k) => {
              const tolerance = parsed[k];
              const range = bandFor(
                weights[k],
                tolerance === null || tolerance === undefined ? {} : { bandAbsBp: tolerance },
              );
              return (
                <div key={k} className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between">
                    <Label htmlFor={`weight-${k}`} className="gap-2">
                      <span aria-hidden className={cn("size-2.5", CLASSES[k].bg)} />
                      {CLASSES[k].name}
                    </Label>
                    <span className="font-heading text-xl tabular-nums">
                      {formatBp(weights[k])}
                    </span>
                  </div>
                  <div className="grid items-center gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
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
                    <div className="flex items-center gap-3">
                      <InputGroup className="w-32" data-invalid={tolerance === undefined}>
                        <InputGroupAddon align="inline-start">±</InputGroupAddon>
                        <InputGroupInput
                          aria-label={`Tolerancja udziału: ${CLASSES[k].name}`}
                          inputMode="decimal"
                          value={tolerances[k]}
                          onChange={(e) => {
                            setSaved(false);
                            setTolerances((t) => ({ ...t, [k]: e.target.value }));
                          }}
                          placeholder={bpToInput(defaultToleranceBp(weights[k]))}
                          aria-invalid={tolerance === undefined ? true : undefined}
                          className="tabular-nums"
                        />
                        <InputGroupAddon align="inline-end">pp</InputGroupAddon>
                      </InputGroup>
                      <span
                        className={cn(
                          "w-24 text-sm tabular-nums",
                          tolerance === undefined ? "text-destructive" : "text-muted-foreground",
                        )}
                      >
                        {tolerance === undefined ? "0–50 pp" : formatBand(range)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {update.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać wag</AlertTitle>
              <AlertDescription>{update.error.message}</AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-4">
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
              <Button
                type="submit"
                disabled={update.isPending || total !== TOTAL_BP || invalid || !dirty}
              >
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
