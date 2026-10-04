import { BP_SCALE, divRound } from "@pip/money";
import type { Band, ClassState } from "./types";

const LARGE_CLASS_BP = 2000;
const DEFAULT_BAND_ABS_BP = 500;
const DEFAULT_BAND_REL_BP = 2500;

/** ±5 pp for weights ≥ 20%, ±25% of the weight below that (gold 5% → 3.75–6.25%). */
export function bandFor(
  targetBp: number,
  overrides: Pick<ClassState, "bandAbsBp" | "bandRelBp"> = {},
): Band {
  const halfWidth =
    targetBp >= LARGE_CLASS_BP
      ? (overrides.bandAbsBp ?? DEFAULT_BAND_ABS_BP)
      : Math.round((targetBp * (overrides.bandRelBp ?? DEFAULT_BAND_REL_BP)) / Number(BP_SCALE));
  return {
    lowerBp: Math.max(0, targetBp - halfWidth),
    upperBp: Math.min(Number(BP_SCALE), targetBp + halfWidth),
  };
}

/** Rescales target weights of the given classes so they sum to 100%. */
export function renormalizedWeights(classes: readonly ClassState[]): Map<string, number> {
  const sum = classes.reduce((acc, c) => acc + c.targetWeightBp, 0);
  return new Map(
    classes.map((c) => [
      c.id,
      sum === 0 ? 0 : Math.round((c.targetWeightBp * Number(BP_SCALE)) / sum),
    ]),
  );
}

export function weightBp(valueMinor: bigint, totalMinor: bigint): number {
  return totalMinor === 0n ? 0 : Number(divRound(valueMinor * BP_SCALE, totalMinor));
}
