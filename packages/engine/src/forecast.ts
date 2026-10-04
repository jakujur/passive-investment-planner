import { maxBig, minBig, shareBp } from "@pip/money";

export interface GoalForecastInput {
  /** Still missing to the down-payment target. */
  remainingMinor: bigint;
  /** Regular monthly contribution. */
  contributionMinor: bigint;
  /** Missing to the cushion target; the plan fills it before anything else. */
  cushionGapMinor: bigint;
  cushionShareBp: number;
  realEstateWeightBp: number;
  /** First month that still pays into the goal, `YYYY-MM`. */
  startMonth: string;
}

export interface GoalForecast {
  months: number;
  /** Month in which the down payment is complete, `YYYY-MM`. */
  completionMonth: string;
  /** What the goal receives in the first forecast month. */
  firstMonthMinor: bigint;
}

const MAX_MONTHS = 1200;

/**
 * Months until a down-payment goal is reached with the regular contribution, following the
 * plan's order: the cushion first, then the real-estate share of what is left goes to the goal.
 * `null` when the goal would never be reached (no contribution or no real-estate weight).
 */
export function forecastGoal(input: GoalForecastInput): GoalForecast | null {
  if (input.remainingMinor <= 0n) {
    return { months: 0, completionMonth: input.startMonth, firstMonthMinor: 0n };
  }
  let remaining = input.remainingMinor;
  let cushionGap = maxBig(0n, input.cushionGapMinor);
  let firstMonthMinor: bigint | null = null;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    const toCushion = minBig(cushionGap, shareBp(input.contributionMinor, input.cushionShareBp));
    cushionGap -= toCushion;
    const toGoal = minBig(
      remaining,
      shareBp(input.contributionMinor - toCushion, input.realEstateWeightBp),
    );
    firstMonthMinor ??= toGoal;
    remaining -= toGoal;
    if (remaining === 0n) {
      return {
        months: month,
        completionMonth: addMonths(input.startMonth, month - 1),
        firstMonthMinor,
      };
    }
    if (toGoal === 0n && cushionGap === 0n) return null;
  }
  return null;
}

export function addMonths(month: string, count: number): string {
  const index = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
