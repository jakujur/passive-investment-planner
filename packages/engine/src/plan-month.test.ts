import { parseRate, RATE_SCALE, sumBig } from "@pip/money";
import { describe, expect, it } from "vitest";
import { DEFAULT_ACCELERATOR_TABLE } from "./accelerator";
import { planMonth } from "./plan-month";
import type { AccountState, ClassState, Plan, PlanItem, PlanState } from "./types";

const zl = (value: number) => BigInt(Math.round(value * 100));

const account = (
  id: string,
  wrapper: AccountState["wrapper"],
  remainingLimit: number | null,
): AccountState => ({
  id,
  wrapper,
  currency: "PLN",
  fxRate: RATE_SCALE,
  remainingLimitMinor: remainingLimit === null ? null : zl(remainingLimit),
});

const COUPLE_ACCOUNTS: AccountState[] = [
  account("cushion", "CASH", null),
  account("ike", "IKE", 28_260),
  account("ikze", "IKZE", 16_956),
  account("ike-obl", "IKE_OBLIGACJE", 28_260),
  account("xtb", "REGULAR", null),
  account("bonds", "REGULAR", null),
  { ...account("gold", "REGULAR", null), currency: "EUR", fxRate: parseRate("4.25") },
];

interface Values {
  equity?: number;
  bonds?: number;
  realEstate?: number;
  gold?: number;
}

function classes(values: Values = {}): ClassState[] {
  return [
    {
      id: "equity",
      kind: "EQUITY",
      name: "Akcje",
      targetWeightBp: 4500,
      valueMinor: zl(values.equity ?? 0),
      accountQueue: ["ike", "ikze", "xtb"],
      instrument: { id: "acwi", type: "ETF", unitPriceMinor: zl(450) },
    },
    {
      id: "bonds",
      kind: "BONDS",
      name: "Obligacje",
      targetWeightBp: 2500,
      valueMinor: zl(values.bonds ?? 0),
      accountQueue: ["ike-obl", "bonds"],
      instrument: { id: "edo", type: "BOND", unitPriceMinor: zl(100) },
    },
    {
      id: "real-estate",
      kind: "REAL_ESTATE",
      name: "Nieruchomości",
      targetWeightBp: 2500,
      valueMinor: zl(values.realEstate ?? 0),
      accountQueue: [],
    },
    {
      id: "gold",
      kind: "GOLD",
      name: "Złoto",
      targetWeightBp: 500,
      valueMinor: zl(values.gold ?? 0),
      accountQueue: ["gold"],
      instrument: { id: "gold-bv", type: "GOLD", unitPriceMinor: null },
    },
  ];
}

function state(overrides: Partial<PlanState> = {}): PlanState {
  return {
    month: "2026-10",
    carryInMinor: 0n,
    cushion: {
      accountId: "cushion",
      balanceMinor: zl(108_000),
      targetMinor: zl(108_000),
      surplusShareBp: 10_000,
    },
    classes: classes(),
    accounts: COUPLE_ACCOUNTS,
    realEstate: { goal: null, mortgage: null },
    equityDrawdownBp: 0,
    acceleratorTable: DEFAULT_ACCELERATOR_TABLE,
    etfRounding: "FRACTIONAL",
    alertMonthsThreshold: 12,
    ...overrides,
  };
}

const buys = (plan: Plan, classId: string) =>
  plan.items.filter(
    (i): i is Extract<PlanItem, { kind: "BUY" }> => i.kind === "BUY" && i.classId === classId,
  );

/** Everything leaving the surplus must be accounted for: transfers + cash carried to next month. */
function expectBalanced(plan: Plan, carryIn = 0n) {
  const transferred = sumBig(plan.items.map((i) => i.amountMinor));
  expect(transferred + plan.carryOutMinor).toBe(plan.surplusMinor + carryIn);
}

describe("planMonth — poduszka", () => {
  it("sends the whole surplus to the cushion while it is below target (etap A)", () => {
    const plan = planMonth(
      state({ cushion: { ...state().cushion, balanceMinor: zl(50_000) } }),
      zl(10_000),
    );

    expect(plan.items).toEqual([
      { kind: "CUSHION", accountId: "cushion", amountMinor: zl(10_000) },
    ]);
    expect(plan.rationale.map((r) => r.subject)).toEqual(["CUSHION"]);
    expectBalanced(plan);
  });

  it("caps the cushion transfer at the gap and invests the rest", () => {
    const plan = planMonth(
      state({ cushion: { ...state().cushion, balanceMinor: zl(104_000) } }),
      zl(10_000),
    );

    expect(plan.items[0]).toEqual({
      kind: "CUSHION",
      accountId: "cushion",
      amountMinor: zl(4_000),
    });
    expect(sumBig(Object.values(plan.allocation))).toBe(zl(6_000));
    expectBalanced(plan);
  });

  it("respects a configured share of the surplus for the cushion", () => {
    const plan = planMonth(
      state({ cushion: { ...state().cushion, balanceMinor: 0n, surplusShareBp: 9000 } }),
      zl(10_000),
    );

    expect(plan.items[0]?.amountMinor).toBe(zl(9_000));
    expect(sumBig(Object.values(plan.allocation))).toBe(zl(1_000));
  });
});

describe("planMonth — strumień nieruchomości", () => {
  it("splits 25% to the down-payment goal and 75% as 45:25:5 when the portfolio starts (etap B)", () => {
    const plan = planMonth(
      state({
        realEstate: {
          goal: { id: "flat", accountId: "cushion", remainingMinor: zl(100_000) },
          mortgage: null,
        },
      }),
      zl(10_000),
    );

    expect(plan.allocation).toEqual({
      equity: zl(4_500),
      bonds: zl(2_500),
      gold: zl(500),
      "real-estate": zl(2_500),
    });
    expect(plan.items).toContainEqual({
      kind: "GOAL",
      goalId: "flat",
      accountId: "cushion",
      amountMinor: zl(2_500),
    });
    expect(buys(plan, "equity")).toEqual([
      expect.objectContaining({ accountId: "ike", amountMinor: zl(4_500), quantity: "10.0000" }),
    ]);
    expect(buys(plan, "bonds")).toEqual([
      expect.objectContaining({ accountId: "ike-obl", amountMinor: zl(2_500), quantity: "25" }),
    ]);
    expect(buys(plan, "gold")).toEqual([
      expect.objectContaining({ currency: "EUR", accountAmountMinor: zl(117.65), quantity: null }),
    ]);
    expect(plan.alerts).toEqual([]);
    expectBalanced(plan);
  });

  it("returns the part of the stream above the remaining goal to the pool", () => {
    const plan = planMonth(
      state({
        realEstate: {
          goal: { id: "flat", accountId: "cushion", remainingMinor: zl(1_000) },
          mortgage: null,
        },
      }),
      zl(10_000),
    );

    expect(plan.allocation["real-estate"]).toBe(zl(1_000));
    expect(sumBig(Object.values(plan.allocation))).toBe(zl(10_000));
  });

  it("returns the stream to the pool without a goal or mortgage", () => {
    const plan = planMonth(state(), zl(10_000));

    expect(plan.allocation["real-estate"]).toBe(0n);
    expect(plan.items.some((i) => i.kind === "GOAL" || i.kind === "OVERPAYMENT")).toBe(false);
    expect(plan.rationale.find((r) => r.subject === "REAL_ESTATE")?.text).toContain(
      "wraca do puli",
    );
  });

  it("holds overpayments and alerts on concentration when real estate is above its band (etap C)", () => {
    const plan = planMonth(
      state({
        classes: classes({ equity: 250_000, bonds: 150_000, realEstate: 550_000, gold: 50_000 }),
        realEstate: { goal: null, mortgage: { id: "m1", balanceMinor: zl(300_000) } },
      }),
      zl(10_000),
    );

    const equity = plan.allocation.equity ?? 0n;
    const bonds = plan.allocation.bonds ?? 0n;
    expect(plan.items.some((i) => i.kind === "OVERPAYMENT")).toBe(false);
    expect(equity + bonds).toBe(zl(10_000));
    expect(equity).toBeGreaterThan(bonds);
    expect(plan.allocation.gold).toBe(0n);
    expect(plan.alerts).toContainEqual(
      expect.objectContaining({ type: "REAL_ESTATE_CONCENTRATION", classId: "real-estate" }),
    );
    expect(plan.alerts).toContainEqual(
      expect.objectContaining({ type: "OUT_OF_BAND", classId: "equity" }),
    );
    expect(plan.carryOutMinor).toBe(bonds % zl(100));
    expectBalanced(plan);
  });
});

describe("planMonth — rebalancing", () => {
  it("sends everything to equities after a 30% crash (przykład 11.2)", () => {
    const plan = planMonth(
      state({
        classes: classes({ equity: 31_500, bonds: 25_000, realEstate: 25_000, gold: 5_000 }),
        realEstate: { goal: null, mortgage: { id: "m1", balanceMinor: zl(300_000) } },
        equityDrawdownBp: 3000,
      }),
      zl(10_000),
    );

    expect(plan.items).toContainEqual({
      kind: "OVERPAYMENT",
      mortgageId: "m1",
      amountMinor: zl(2_500),
    });
    expect(plan.allocation).toMatchObject({ equity: zl(7_500), bonds: 0n, gold: 0n });
    expect(plan.alerts).toEqual([]);
    expectBalanced(plan);
  });

  it("adds carried-over cash to the pool", () => {
    const plan = planMonth(state({ carryInMinor: zl(100) }), zl(10_000));

    expect(sumBig(Object.values(plan.allocation))).toBe(zl(10_100));
    expectBalanced(plan, zl(100));
  });

  it("alerts when a class cannot return to its band within the threshold", () => {
    const plan = planMonth(
      state({ classes: classes({ equity: 10_000, bonds: 200_000, gold: 5_000 }) }),
      zl(1_000),
    );

    const bondsAlert = plan.alerts.find((a) => a.type === "OUT_OF_BAND" && a.classId === "bonds");
    expect(bondsAlert).toMatchObject({ monthsToReturn: expect.any(Number) });
    expect(bondsAlert?.type === "OUT_OF_BAND" && (bondsAlert.monthsToReturn ?? 0) > 12).toBe(true);
  });
});

describe("planMonth — accelerator", () => {
  it("raises equities to 1.3× the base amount at −20%, funded by other classes", () => {
    const plan = planMonth(
      state({
        classes: classes({ equity: 45_000, bonds: 25_000, gold: 5_000 }),
        equityDrawdownBp: 2000,
      }),
      zl(10_000),
    );

    expect(plan.allocation.equity).toBe(zl(7_800));
    expect(sumBig(Object.values(plan.allocation))).toBe(zl(10_000));
    expect(plan.rationale.find((r) => r.subject === "equity")?.text).toContain("Accelerator ×1,3");
  });

  it("never pushes equities above the upper band", () => {
    const plan = planMonth(
      state({
        classes: classes({ equity: 55_000, bonds: 25_000, gold: 5_000 }),
        equityDrawdownBp: 6000,
      }),
      zl(10_000),
    );

    // Upper band 65% of 95 000 zł after deposit = 61 750 zł → at most 6 750 zł more.
    expect(plan.allocation.equity).toBe(zl(6_750));
  });

  it("stops once equities already sit at the upper band", () => {
    const plan = planMonth(
      state({
        classes: classes({ equity: 70_000, bonds: 25_000, gold: 5_000 }),
        equityDrawdownBp: 6000,
      }),
      zl(10_000),
    );

    expect(plan.allocation.equity).toBe(0n);
    expect(plan.rationale.find((r) => r.subject === "equity")?.text).toContain(
      "Accelerator wstrzymany",
    );
  });
});

describe("planMonth — konta i limity", () => {
  it("spills over to IKZE when the IKE limit is nearly used up", () => {
    const plan = planMonth(
      state({
        accounts: COUPLE_ACCOUNTS.map((a) =>
          a.id === "ike" ? { ...a, remainingLimitMinor: zl(1_000) } : a,
        ),
      }),
      zl(10_000),
    );

    const equity = buys(plan, "equity");
    expect(equity.map((b) => b.accountId)).toEqual(["ike", "ikze"]);
    expect(equity[0]?.amountMinor).toBe(zl(1_000));
    expect(sumBig(equity.map((b) => b.amountMinor))).toBe(plan.allocation.equity);
  });

  it("shares one account's limit between classes that queue on it", () => {
    const plan = planMonth(
      state({
        classes: classes().map((c) =>
          c.id === "bonds" ? { ...c, accountQueue: ["ike", "bonds"] } : c,
        ),
        accounts: COUPLE_ACCOUNTS.map((a) =>
          a.id === "ike" ? { ...a, remainingLimitMinor: zl(5_000) } : a,
        ),
      }),
      zl(10_000),
    );

    const ikeTotal = sumBig(
      plan.items.flatMap((i) => (i.kind === "BUY" && i.accountId === "ike" ? [i.amountMinor] : [])),
    );
    expect(ikeTotal).toBe(zl(5_000));
    expect(buys(plan, "bonds").map((b) => b.accountId)).toEqual(["bonds"]);
  });

  it("plans for a single person with one IKE and one IKZE-Obligacje (wariant B)", () => {
    const single: AccountState[] = [
      account("cushion", "CASH", null),
      account("ike", "IKE", 28_260),
      account("ikze-obl", "IKZE_OBLIGACJE", 500),
      account("xtb", "REGULAR", null),
      account("bonds", "REGULAR", null),
      account("gold", "REGULAR", null),
    ];
    const plan = planMonth(
      state({
        accounts: single,
        classes: classes().map((c) =>
          c.id === "equity"
            ? { ...c, accountQueue: ["ike", "xtb"] }
            : c.id === "bonds"
              ? { ...c, accountQueue: ["ikze-obl", "bonds"] }
              : c,
        ),
      }),
      zl(10_000),
    );

    expect(buys(plan, "bonds")).toEqual([
      expect.objectContaining({ accountId: "ikze-obl", amountMinor: zl(500), quantity: "5" }),
      expect.objectContaining({ accountId: "bonds", amountMinor: zl(2_800), quantity: "28" }),
    ]);
    expect(buys(plan, "equity").map((b) => b.accountId)).toEqual(["ike"]);
    expectBalanced(plan);
  });

  it("alerts and carries cash when no account in the queue has room", () => {
    const plan = planMonth(
      state({
        classes: classes().map((c) => (c.id === "equity" ? { ...c, accountQueue: ["ike"] } : c)),
        accounts: COUPLE_ACCOUNTS.map((a) =>
          a.id === "ike" ? { ...a, remainingLimitMinor: zl(1_000) } : a,
        ),
      }),
      zl(10_000),
    );

    expect(plan.alerts).toContainEqual(
      expect.objectContaining({ type: "NO_ACCOUNT_CAPACITY", classId: "equity" }),
    );
    expectBalanced(plan);
  });
});

describe("planMonth — zaokrąglenia", () => {
  it("buys whole ETF units and carries the remainder", () => {
    const plan = planMonth(
      state({
        etfRounding: "WHOLE",
        classes: classes().map((c) =>
          c.id === "equity"
            ? { ...c, instrument: { id: "acwi", type: "ETF", unitPriceMinor: zl(400) } }
            : c,
        ),
        realEstate: {
          goal: { id: "flat", accountId: "cushion", remainingMinor: zl(100_000) },
          mortgage: null,
        },
      }),
      zl(10_000),
    );

    expect(buys(plan, "equity")).toEqual([
      expect.objectContaining({ amountMinor: zl(4_400), quantity: "11" }),
    ]);
    expect(plan.carryOutMinor).toBe(zl(100));
    expectBalanced(plan);
  });
});
