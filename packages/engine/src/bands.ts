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
  // An explicit ± pp tolerance wins for any class size; otherwise the guide's default rule applies.
  const halfWidth =
    overrides.bandAbsBp !== undefined
      ? overrides.bandAbsBp
      : targetBp >= LARGE_CLASS_BP
        ? DEFAULT_BAND_ABS_BP
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

/**
 * Which classes form the rebalanced portfolio and their bands. Until a property is counted,
 * the portfolio is equities/bonds/gold only, so bands use weights renormalized without real estate.
 */
export function bandContext(classes: readonly ClassState[]) {
  const realEstate = classes.find((c) => c.kind === "REAL_ESTATE");
  const realEstateCounted = (realEstate?.valueMinor ?? 0n) > 0n;
  const bandClasses = realEstateCounted ? classes : classes.filter((c) => c.kind !== "REAL_ESTATE");
  const bandWeights = renormalizedWeights(bandClasses);
  const bands = new Map(
    bandClasses.map((c) => [c.id, bandFor(bandWeights.get(c.id) ?? 0, c)] as const),
  );
  const bandTotal = bandClasses.reduce((acc, c) => acc + c.valueMinor, 0n);
  return { realEstateCounted, bandClasses, bandWeights, bands, bandTotal };
}

export interface ClassPosition {
  classId: string;
  valueMinor: bigint;
  /** Current share of the rebalanced portfolio; `null` when the class is outside it. */
  weightBp: number | null;
  /** Target within the rebalanced portfolio (renormalized before real estate is counted). */
  effectiveTargetBp: number | null;
  band: Band | null;
}

export function classPositions(classes: readonly ClassState[]): ClassPosition[] {
  const { bandWeights, bands, bandTotal } = bandContext(classes);
  return classes.map((c) => {
    const band = bands.get(c.id) ?? null;
    return {
      classId: c.id,
      valueMinor: c.valueMinor,
      weightBp: band ? weightBp(c.valueMinor, bandTotal) : null,
      effectiveTargetBp: band ? (bandWeights.get(c.id) ?? 0) : null,
      band,
    };
  });
}

export function weightBp(valueMinor: bigint, totalMinor: bigint): number {
  return totalMinor === 0n ? 0 : Number(divRound(valueMinor * BP_SCALE, totalMinor));
}
