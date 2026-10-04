import { describe, expect, it } from "vitest";
import { addMonths, forecastGoal } from "./forecast";

const base = {
  contributionMinor: 1_000_000n,
  cushionGapMinor: 0n,
  cushionShareBp: 10_000,
  realEstateWeightBp: 2500,
  startMonth: "2026-10",
};

describe("forecastGoal", () => {
  it("counts the current month as the first payment", () => {
    // 2 500 zł a month towards 100 000 zł → 40 months, last one in January 2030.
    expect(forecastGoal({ ...base, remainingMinor: 10_000_000n })).toEqual({
      months: 40,
      completionMonth: "2030-01",
      firstMonthMinor: 250_000n,
    });
  });

  it("waits for the cushion before paying into the goal", () => {
    // 15 000 zł missing in the cushion: one full month and half of the next go there.
    const forecast = forecastGoal({
      ...base,
      remainingMinor: 500_000n,
      cushionGapMinor: 1_500_000n,
    });
    expect(forecast).toEqual({ months: 4, completionMonth: "2027-01", firstMonthMinor: 0n });
  });

  it("returns null when nothing ever reaches the goal", () => {
    expect(forecastGoal({ ...base, remainingMinor: 1n, realEstateWeightBp: 0 })).toBeNull();
    expect(forecastGoal({ ...base, remainingMinor: 1n, contributionMinor: 0n })).toBeNull();
  });
});

describe("addMonths", () => {
  it("rolls over years", () => {
    expect(addMonths("2026-10", 3)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});
