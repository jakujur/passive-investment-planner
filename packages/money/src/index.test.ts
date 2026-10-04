import { describe, expect, it } from "vitest";
import {
  allocate,
  divRound,
  formatMoney,
  fromBase,
  money,
  parseMoney,
  parseRate,
  toBase,
  toDecimalString,
} from "./index";

describe("divRound", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
  });
});

describe("allocate", () => {
  it("always sums to the total", () => {
    expect(allocate(100n, [1n, 1n, 1n])).toEqual([34n, 33n, 33n]);
    expect(allocate(750000n, [4500n, 2500n, 500n])).toEqual([450000n, 250000n, 50000n]);
  });

  it("returns zeros when all weights are zero", () => {
    expect(allocate(10n, [0n, 0n])).toEqual([0n, 0n]);
  });
});

describe("parsing and formatting", () => {
  it("parses Polish and dotted decimals", () => {
    expect(parseMoney("1 234,56")).toBe(123456n);
    expect(parseMoney("12.5")).toBe(1250n);
    expect(parseMoney("-3")).toBe(-300n);
    expect(() => parseMoney("1,234")).toThrow(RangeError);
    expect(() => parseMoney("abc")).toThrow(SyntaxError);
  });

  it("formats as zł.gr without going through number", () => {
    expect(formatMoney(money(123456789012345678n))).toMatch(/1\s234\s567\s890\s123\s456,78\szł/);
    expect(toDecimalString(5n)).toBe("0.05");
    expect(toDecimalString(-5n)).toBe("-0.05");
  });

  it("converts through NBP rates", () => {
    const usd = parseRate("3.6512");
    expect(toBase(10000n, usd)).toBe(36512n);
    expect(fromBase(36512n, usd)).toBe(10000n);
  });
});
