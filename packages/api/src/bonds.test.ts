import { describe, expect, it } from "vitest";
import { bondMaturityDate, bondPurchaseDate, bondSeries, parseBondSeries } from "./bonds";

describe("bond series", () => {
  it("names a series after its maturity month", () => {
    expect(bondSeries("EDO", "2026-10-04")).toBe("EDO1036");
    expect(bondSeries("ROD", "2026-03-06")).toBe("ROD0338");
    expect(bondSeries("OTS", "2026-11-15")).toBe("OTS0227");
  });

  it("parses series codes from the bond service statement", () => {
    expect(parseBondSeries("ROD0338")).toEqual({ ticker: "ROD", maturityMonth: "2038-03" });
    expect(parseBondSeries("edo1036")).toEqual({ ticker: "EDO", maturityMonth: "2036-10" });
    expect(parseBondSeries("XYZ0338")).toBeNull();
    expect(parseBondSeries("ROD1338")).toBeNull();
  });

  it("derives purchase and maturity dates from each other", () => {
    expect(bondPurchaseDate("ROD", "2038-03-06")).toBe("2026-03-06");
    expect(bondMaturityDate("ROD", "2026-03-06")).toBe("2038-03-06");
    expect(bondMaturityDate("OTS", "2026-11-30")).toBe("2027-02-28");
  });
});
