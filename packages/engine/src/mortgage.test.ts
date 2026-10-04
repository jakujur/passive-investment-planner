import { describe, expect, it } from "vitest";
import {
  annuityInstallment,
  applyOverpayment,
  completeTerms,
  interestSaved,
  type MortgageState,
  monthsBetween,
  monthsToRepay,
  payInstallment,
  projectMortgage,
} from "./mortgage";

// 400 000 zł, 7,2% rocznie, 25 lat
const BALANCE = 40_000_000n;
const RATE = 720;

describe("annuity", () => {
  it("matches the standard formula (≈ 2 878,36 zł for 400 000 zł / 7,2% / 300 months)", () => {
    expect(annuityInstallment(BALANCE, RATE, 300)).toBe(287_836n);
  });

  it("finds the term back from the installment", () => {
    expect(monthsToRepay(BALANCE, RATE, 287_836n)).toBe(300);
    expect(monthsToRepay(BALANCE, RATE, 200_000n)).toBeNull();
  });

  it("completes missing terms from either the end date or the installment", () => {
    const base = { balanceMinor: BALANCE, rateBp: RATE, installmentType: "EQUAL" as const };
    expect(completeTerms({ ...base, monthsLeft: 300, installmentMinor: null })).toEqual({
      monthsLeft: 300,
      installmentMinor: 287_836n,
    });
    expect(completeTerms({ ...base, monthsLeft: null, installmentMinor: 287_836n })).toEqual({
      monthsLeft: 300,
      installmentMinor: 287_836n,
    });
  });
});

const equal: MortgageState = {
  balanceMinor: BALANCE,
  rateBp: RATE,
  installmentMinor: 287_836n,
  monthsLeft: 300,
  installmentType: "EQUAL",
  overpaymentMode: "SHORTEN",
};

describe("installments", () => {
  it("splits an equal installment into interest and principal", () => {
    const paid = payInstallment(equal);
    expect(paid.interestMinor).toBe(240_000n); // 400 000 × 0,6%
    expect(paid.principalMinor).toBe(47_836n);
    expect(paid.state.balanceMinor).toBe(BALANCE - 47_836n);
    expect(paid.state.monthsLeft).toBe(299);
  });

  it("pays the loan off exactly by the end of the schedule", () => {
    const { points, lastMonth } = projectMortgage(equal, "2026-10");
    expect(points).toHaveLength(300);
    expect(points.at(-1)?.balanceMinor).toBe(0n);
    expect(lastMonth).toBe("2051-10");
  });

  it("keeps the principal part of decreasing installments level", () => {
    const decreasing: MortgageState = {
      ...equal,
      installmentType: "DECREASING",
      installmentMinor: 133_334n + 240_000n,
    };
    const first = payInstallment(decreasing);
    expect(first.principalMinor).toBe(133_334n);
    expect(first.state.installmentMinor).toBeLessThan(decreasing.installmentMinor);
  });
});

describe("overpayment", () => {
  it("shortens the term and saves interest", () => {
    const after = applyOverpayment(equal, 5_000_000n);
    expect(after.installmentMinor).toBe(equal.installmentMinor);
    expect(after.monthsLeft).toBeLessThan(300);
    expect(interestSaved(equal, after, "2026-10")).toBeGreaterThan(5_000_000n);
  });

  it("lowers the installment when the bank keeps the term", () => {
    const after = applyOverpayment({ ...equal, overpaymentMode: "LOWER_INSTALLMENT" }, 5_000_000n);
    expect(after.monthsLeft).toBe(300);
    expect(after.installmentMinor).toBe(annuityInstallment(35_000_000n, RATE, 300));
  });

  it("closes the loan when the overpayment covers the balance", () => {
    expect(applyOverpayment(equal, 50_000_000n)).toMatchObject({
      balanceMinor: 0n,
      monthsLeft: 0,
      installmentMinor: 0n,
    });
  });
});

describe("monthsBetween", () => {
  it("counts calendar months", () => {
    expect(monthsBetween("2026-10", "2051-10")).toBe(300);
  });
});
