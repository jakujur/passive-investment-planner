import { parseRate } from "@pip/money";
import { describe, expect, it } from "vitest";
import { asOf, drawdownBp, type InstrumentQuotes, parseQuantity, valueSeries } from "./valuation";

const eurQuotes: InstrumentQuotes = {
  prices: [
    { date: "2026-01-02", closeMinor: 10_000n },
    { date: "2026-02-02", closeMinor: 11_000n },
  ],
  fx: [{ date: "2026-01-01", rate: parseRate("4.25") }],
};

describe("asOf", () => {
  it("returns the latest point not after the date", () => {
    expect(asOf(eurQuotes.prices, "2026-01-31")?.closeMinor).toBe(10_000n);
    expect(asOf(eurQuotes.prices, "2026-02-02")?.closeMinor).toBe(11_000n);
    expect(asOf(eurQuotes.prices, "2025-12-31")).toBeUndefined();
  });
});

describe("valueSeries", () => {
  it("values quantities at quoted price × NBP rate and keeps cost for unquoted purchases", () => {
    const series = valueSeries(
      [
        { date: "2026-01-02", instrumentId: "acwi", quantity: "10", costMinor: 425_000n },
        { date: "2026-01-15", instrumentId: "gold", quantity: null, costMinor: 50_000n },
      ],
      new Map([["acwi", eurQuotes]]),
      ["2026-01-01", "2026-01-10", "2026-02-10"],
    );

    expect(series).toEqual([
      { date: "2026-01-01", contributedMinor: 0n, valueMinor: 0n },
      { date: "2026-01-10", contributedMinor: 425_000n, valueMinor: 425_000n },
      // 10 × 110,00 EUR × 4,25 = 4 675 zł, plus gold at cost
      { date: "2026-02-10", contributedMinor: 475_000n, valueMinor: 517_500n },
    ]);
  });
});

describe("parseQuantity", () => {
  it("scales to 8 decimals", () => {
    expect(parseQuantity("1.5")).toBe(150_000_000n);
    expect(parseQuantity("10.00000000")).toBe(1_000_000_000n);
  });
});

describe("drawdownBp", () => {
  it("measures the fall from the peak to the last close", () => {
    expect(
      drawdownBp([
        { date: "a", closeMinor: 100n },
        { date: "b", closeMinor: 200n },
        { date: "c", closeMinor: 150n },
      ]),
    ).toBe(2500);
    expect(drawdownBp([])).toBe(0);
  });
});
