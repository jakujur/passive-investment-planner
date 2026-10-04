import type { AcceleratorStep } from "./types";

/** Table from the guide: 0…−5% ×1.0, −5…−15% ×1.1, −15…−30% ×1.3, −30…−50% ×1.5, below −50% ×2.0. */
export const DEFAULT_ACCELERATOR_TABLE: readonly AcceleratorStep[] = [
  { minDrawdownBp: 0, multiplierBp: 10_000 },
  { minDrawdownBp: 500, multiplierBp: 11_000 },
  { minDrawdownBp: 1500, multiplierBp: 13_000 },
  { minDrawdownBp: 3000, multiplierBp: 15_000 },
  { minDrawdownBp: 5000, multiplierBp: 20_000 },
];

export function acceleratorMultiplierBp(
  table: readonly AcceleratorStep[],
  drawdownBp: number,
): number {
  let multiplier = 10_000;
  for (const step of [...table].sort((a, b) => a.minDrawdownBp - b.minDrawdownBp)) {
    if (drawdownBp >= step.minDrawdownBp) multiplier = step.multiplierBp;
  }
  return multiplier;
}
