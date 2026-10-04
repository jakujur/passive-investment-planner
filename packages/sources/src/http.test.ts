import { describe, expect, it } from "vitest";
import { dateChunks, dropOutliers } from "./http";

describe("dateChunks", () => {
  it("splits an inclusive range into windows NBP accepts", () => {
    expect(dateChunks("2026-01-01", "2026-01-10", 4)).toEqual([
      ["2026-01-01", "2026-01-04"],
      ["2026-01-05", "2026-01-08"],
      ["2026-01-09", "2026-01-10"],
    ]);
  });
});

describe("dropOutliers", () => {
  it("rejects non-positive values and jumps above the limit, comparing to the last accepted point", () => {
    const { accepted, rejected } = dropOutliers(
      [100n, 0n, 105n, 200n, 110n],
      (v) => v,
      1_000n,
      100n,
    );
    expect(accepted).toEqual([100n, 105n, 110n]);
    expect(rejected).toEqual([0n, 200n]);
  });
});
