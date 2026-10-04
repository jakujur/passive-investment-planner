import type { Currency } from "@pip/money";
import type { Wrapper } from "./types";

export type WrapperFamily = "IKE" | "IKZE";

export interface AnnualLimits {
  year: number;
  ikeMinor: bigint;
  ikzeMinor: bigint;
  ikzeEntrepreneurMinor: bigint;
}

/** MRPiPS announcement for 2026. */
export const LIMITS_2026: AnnualLimits = {
  year: 2026,
  ikeMinor: 2_826_000n,
  ikzeMinor: 1_130_400n,
  ikzeEntrepreneurMinor: 1_695_600n,
};

/** IKE-Obligacje and IKZE-Obligacje are the same legal slot as IKE / IKZE, only at another provider. */
export function wrapperFamily(wrapper: Wrapper): WrapperFamily | null {
  switch (wrapper) {
    case "IKE":
    case "IKE_OBLIGACJE":
      return "IKE";
    case "IKZE":
    case "IKZE_OBLIGACJE":
      return "IKZE";
    default:
      return null;
  }
}

export function annualLimitMinor(
  family: WrapperFamily,
  isEntrepreneur: boolean,
  limits: AnnualLimits,
): bigint {
  if (family === "IKE") return limits.ikeMinor;
  return isEntrepreneur ? limits.ikzeEntrepreneurMinor : limits.ikzeMinor;
}

/**
 * A person may hold one IKE and one IKZE, both in PLN. Returns human-readable violations
 * for the accounts of a single person (empty when valid).
 */
export function validatePersonAccounts(
  accounts: readonly { wrapper: Wrapper; currency: Currency }[],
): string[] {
  const errors: string[] = [];
  for (const family of ["IKE", "IKZE"] as const) {
    const count = accounts.filter((a) => wrapperFamily(a.wrapper) === family).length;
    if (count > 1) {
      errors.push(`Osoba może mieć tylko jedno ${family} (wliczając ${family}-Obligacje).`);
    }
  }
  for (const account of accounts) {
    if (wrapperFamily(account.wrapper) && account.currency !== "PLN") {
      errors.push(`Konto ${account.wrapper} musi być prowadzone w PLN.`);
    }
  }
  return errors;
}
