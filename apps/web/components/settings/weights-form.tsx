"use client";

import { type AssetClassKind, bandFor } from "@pip/engine";
import { shareBp } from "@pip/money";
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
import { bpToInput, formatBand, formatBp, formatPln, readPercentBp } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

export interface ClassWeight {
  weightBp: number;
  toleranceBp: number | null;
}
type Weights = Record<AssetClassKind, number>;
type Tolerances = Record<AssetClassKind, string>;
type WeightDrafts = Record<AssetClassKind, string>;

const TOTAL_BP = 10_000;
/** Slider step 0,1%; the exact field accepts two decimals (0,01% = 1 bp). */
const SLIDER_STEP_BP = 10;

function perClass<T>(f: (kind: AssetClassKind) => T): Record<AssetClassKind, T> {
  return { EQUITY: f("EQUITY"), BONDS: f("BONDS"), REAL_ESTATE: f("REAL_ESTATE"), GOLD: f("GOLD") };
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

export function WeightsForm({
  initial,
  monthlyContributionMinor,
}: {
  initial: Record<AssetClassKind, ClassWeight>;
  monthlyContributionMinor: bigint;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [weights, setWeights] = useState<Weights>(() => perClass((k) => initial[k].weightBp));
  const [tolerances, setTolerances] = useState<Tolerances>(() =>
    perClass((k) => {
      const tolerance = initial[k].toleranceBp;
      return tolerance === null ? "" : bpToInput(tolerance);
    }),
  );
  /** Text in the exact weight fields; committed on blur or Enter. */
  const [weightDrafts, setWeightDrafts] = useState<WeightDrafts>(() =>
    perClass((k) => bpToInput(initial[k].weightBp)),
  );
  const [saved, setSaved] = useState(false);

  /** Each weight is independent; the sum has to reach 100% before saving. */
  function applyWeight(kind: AssetClassKind, valueBp: number) {
    setSaved(false);
    const value = Math.max(0, Math.min(TOTAL_BP, Math.round(valueBp)));
    setWeights((w) => ({ ...w, [kind]: value }));
    setWeightDrafts((d) => ({ ...d, [kind]: bpToInput(value) }));
  }

  function commitDraft(kind: AssetClassKind) {
    const bp = readPercentBp(weightDrafts[kind]);
    if (bp === null || bp < 0 || bp > TOTAL_BP) {
      setWeightDrafts((d) => ({ ...d, [kind]: bpToInput(weights[kind]) }));
      return;
    }
    if (bp !== weights[kind]) applyWeight(kind, bp);
  }
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
            Każdą wagę ustawiasz osobno; zapis wymaga sumy 100%. Kwota obok to miesięczna część
            stałej wpłaty przy pełnej poduszce i portfelu w celu. Tolerancja to dopuszczalne
            odchylenie udziału w pp; puste pole = domyślne ±5 pp (klasy od 20%) albo ±25% wagi.
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
          <div className="flex flex-col divide-y divide-border">
            {CLASS_ORDER.map((k) => {
              const tolerance = parsed[k];
              const range = bandFor(
                weights[k],
                tolerance === null || tolerance === undefined ? {} : { bandAbsBp: tolerance },
              );
              return (
                <div
                  key={k}
                  className="grid items-center gap-x-6 gap-y-3 py-4 first:pt-0 last:pb-0 md:grid-cols-[9rem_minmax(0,1fr)_auto_7rem_auto]"
                >
                  <Label htmlFor={`weight-${k}`} className="gap-2">
                    <span aria-hidden className={cn("size-2.5", CLASSES[k].bg)} />
                    {CLASSES[k].name}
                  </Label>
                  <Slider
                    id={`weight-${k}`}
                    aria-label={`Waga: ${CLASSES[k].name}`}
                    min={0}
                    max={TOTAL_BP}
                    step={SLIDER_STEP_BP}
                    value={[weights[k]]}
                    onValueChange={(value) => {
                      const next = Array.isArray(value) ? value[0] : value;
                      if (next === undefined) return;
                      applyWeight(k, next);
                    }}
                    className={SLIDER_TONE[k]}
                  />
                  <InputGroup className="w-28">
                    <InputGroupInput
                      aria-label={`Waga w procentach: ${CLASSES[k].name}`}
                      inputMode="decimal"
                      value={weightDrafts[k]}
                      onChange={(e) => setWeightDrafts((d) => ({ ...d, [k]: e.target.value }))}
                      onBlur={() => commitDraft(k)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          commitDraft(k);
                        }
                      }}
                      className="text-right font-medium tabular-nums"
                    />
                    <InputGroupAddon align="inline-end">%</InputGroupAddon>
                  </InputGroup>
                  <span className="text-sm text-muted-foreground tabular-nums md:text-right">
                    ≈ {formatPln(shareBp(monthlyContributionMinor, weights[k]))}
                  </span>
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
              Suma {formatBp(total, 2)}
              {total < TOTAL_BP && ` · brakuje ${formatBp(TOTAL_BP - total, 2)}`}
              {total > TOTAL_BP && ` · za dużo o ${formatBp(total - TOTAL_BP, 2)}`}
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
