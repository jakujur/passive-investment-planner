import { describe, expect, it } from "vitest";
import { acceleratorMultiplierBp, DEFAULT_ACCELERATOR_TABLE } from "./accelerator";
import { bandFor } from "./bands";
import { annualLimitMinor, LIMITS_2026, validatePersonAccounts } from "./limits";

describe("validatePersonAccounts", () => {
  it("allows one IKE and one IKZE of any flavour", () => {
    expect(
      validatePersonAccounts([
        { wrapper: "IKE", currency: "PLN" },
        { wrapper: "IKZE_OBLIGACJE", currency: "PLN" },
        { wrapper: "REGULAR", currency: "USD" },
        { wrapper: "REGULAR", currency: "PLN" },
      ]),
    ).toEqual([]);
  });

  it("rejects IKE together with IKE-Obligacje for the same person", () => {
    expect(
      validatePersonAccounts([
        { wrapper: "IKE", currency: "PLN" },
        { wrapper: "IKE_OBLIGACJE", currency: "PLN" },
      ]),
    ).toHaveLength(1);
  });

  it("rejects tax wrappers outside PLN", () => {
    expect(validatePersonAccounts([{ wrapper: "IKZE", currency: "EUR" }])).toHaveLength(1);
  });
});

describe("annualLimitMinor", () => {
  it("uses the entrepreneur IKZE limit only for entrepreneurs", () => {
    expect(annualLimitMinor("IKZE", true, LIMITS_2026)).toBe(1_695_600n);
    expect(annualLimitMinor("IKZE", false, LIMITS_2026)).toBe(1_130_400n);
    expect(annualLimitMinor("IKE", true, LIMITS_2026)).toBe(2_826_000n);
  });
});

describe("bandFor", () => {
  it("uses ±5 pp for large classes and ±25% for small ones", () => {
    expect(bandFor(4500)).toEqual({ lowerBp: 4000, upperBp: 5000 });
    expect(bandFor(500)).toEqual({ lowerBp: 375, upperBp: 625 });
  });

  it("applies an explicit ± tolerance to any class size", () => {
    expect(bandFor(500, { bandAbsBp: 200 })).toEqual({ lowerBp: 300, upperBp: 700 });
    expect(bandFor(4500, { bandAbsBp: 300 })).toEqual({ lowerBp: 4200, upperBp: 4800 });
  });
});

describe("acceleratorMultiplierBp", () => {
  it("follows the guide's table", () => {
    const at = (bp: number) => acceleratorMultiplierBp(DEFAULT_ACCELERATOR_TABLE, bp);
    expect([at(0), at(499), at(500), at(2000), at(4000), at(5500)]).toEqual([
      10_000, 10_000, 11_000, 13_000, 15_000, 20_000,
    ]);
  });
});
