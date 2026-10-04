import { divRound, maxBig, minBig } from "@pip/money";
import { addMonths } from "./forecast";

export type InstallmentType = "EQUAL" | "DECREASING";
export type OverpaymentMode = "SHORTEN" | "LOWER_INSTALLMENT";

/** Monthly interest uses the nominal annual rate / 12, as Polish banks do. 120 000 = 12 months × 10 000 bp. */
const MONTHLY_RATE_DENOMINATOR = 120_000n;
const MAX_MONTHS = 600;

export interface MortgageState {
  balanceMinor: bigint;
  rateBp: number;
  /** Next installment (for DECREASING the one due next month). */
  installmentMinor: bigint;
  /** Installments still to pay after the state's month. */
  monthsLeft: number;
  installmentType: InstallmentType;
  overpaymentMode: OverpaymentMode;
}

export function monthlyInterest(balanceMinor: bigint, rateBp: number): bigint {
  return divRound(balanceMinor * BigInt(rateBp), MONTHLY_RATE_DENOMINATOR);
}

/** Equal (annuity) installment repaying `balance` in `months`: B·r·(1+r)^n / ((1+r)^n − 1), exact in integers. */
export function annuityInstallment(balanceMinor: bigint, rateBp: number, months: number): bigint {
  if (months <= 0 || balanceMinor <= 0n) return 0n;
  if (rateBp === 0) return divCeil(balanceMinor, BigInt(months));
  const p = (MONTHLY_RATE_DENOMINATOR + BigInt(rateBp)) ** BigInt(months);
  const q = MONTHLY_RATE_DENOMINATOR ** BigInt(months);
  return divCeil(balanceMinor * BigInt(rateBp) * p, MONTHLY_RATE_DENOMINATOR * (p - q));
}

/** Next decreasing installment: equal principal part plus this month's interest. */
export function decreasingInstallment(
  balanceMinor: bigint,
  rateBp: number,
  months: number,
): bigint {
  if (months <= 0 || balanceMinor <= 0n) return 0n;
  return divCeil(balanceMinor, BigInt(months)) + monthlyInterest(balanceMinor, rateBp);
}

/**
 * Number of equal installments of `installment` needed to repay `balance`;
 * `null` when the installment does not even cover the interest.
 */
export function monthsToRepay(
  balanceMinor: bigint,
  rateBp: number,
  installmentMinor: bigint,
): number | null {
  let balance = balanceMinor;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    const principal = installmentMinor - monthlyInterest(balance, rateBp);
    if (principal <= 0n) return null;
    balance -= principal;
    if (balance <= 0n) return month;
  }
  return null;
}

/**
 * Completes the terms from what the user knows: the remaining months (from the last-installment
 * month) and/or the current installment. With both given they are taken as they are.
 */
export function completeTerms(input: {
  balanceMinor: bigint;
  rateBp: number;
  installmentType: InstallmentType;
  monthsLeft: number | null;
  installmentMinor: bigint | null;
}): { monthsLeft: number; installmentMinor: bigint } | null {
  const { balanceMinor, rateBp, installmentType, monthsLeft, installmentMinor } = input;
  if (balanceMinor <= 0n) return { monthsLeft: 0, installmentMinor: 0n };
  if (monthsLeft !== null && installmentMinor !== null) return { monthsLeft, installmentMinor };
  if (monthsLeft !== null) {
    return {
      monthsLeft,
      installmentMinor:
        installmentType === "EQUAL"
          ? annuityInstallment(balanceMinor, rateBp, monthsLeft)
          : decreasingInstallment(balanceMinor, rateBp, monthsLeft),
    };
  }
  if (installmentMinor === null) return null;
  if (installmentType === "EQUAL") {
    const months = monthsToRepay(balanceMinor, rateBp, installmentMinor);
    return months === null ? null : { monthsLeft: months, installmentMinor };
  }
  // Decreasing: the installment's principal part (installment − interest) sets the term.
  const principal = installmentMinor - monthlyInterest(balanceMinor, rateBp);
  if (principal <= 0n) return null;
  return { monthsLeft: Number(divCeil(balanceMinor, principal)), installmentMinor };
}

/** Pays one regular installment; the next installment follows the installment type. */
export function payInstallment(state: MortgageState): {
  interestMinor: bigint;
  principalMinor: bigint;
  paidMinor: bigint;
  state: MortgageState;
} {
  if (state.balanceMinor <= 0n || state.monthsLeft <= 0) {
    return {
      interestMinor: 0n,
      principalMinor: 0n,
      paidMinor: 0n,
      state: { ...state, monthsLeft: 0 },
    };
  }
  const interestMinor = monthlyInterest(state.balanceMinor, state.rateBp);
  const scheduledPrincipal =
    state.installmentType === "EQUAL"
      ? state.installmentMinor - interestMinor
      : divCeil(state.balanceMinor, BigInt(state.monthsLeft));
  // The last installment clears whatever is left.
  const principalMinor =
    state.monthsLeft === 1
      ? state.balanceMinor
      : minBig(state.balanceMinor, maxBig(0n, scheduledPrincipal));
  const balanceMinor = state.balanceMinor - principalMinor;
  const monthsLeft = balanceMinor === 0n ? 0 : state.monthsLeft - 1;
  return {
    interestMinor,
    principalMinor,
    paidMinor: interestMinor + principalMinor,
    state: {
      ...state,
      balanceMinor,
      monthsLeft,
      installmentMinor:
        state.installmentType === "EQUAL"
          ? state.installmentMinor
          : decreasingInstallment(balanceMinor, state.rateBp, monthsLeft),
    },
  };
}

/** Overpayment: the bank either shortens the term or lowers the installment. */
export function applyOverpayment(state: MortgageState, amountMinor: bigint): MortgageState {
  const balanceMinor = maxBig(0n, state.balanceMinor - amountMinor);
  if (balanceMinor === 0n) return { ...state, balanceMinor, monthsLeft: 0, installmentMinor: 0n };
  if (state.overpaymentMode === "LOWER_INSTALLMENT") {
    return {
      ...state,
      balanceMinor,
      installmentMinor:
        state.installmentType === "EQUAL"
          ? annuityInstallment(balanceMinor, state.rateBp, state.monthsLeft)
          : decreasingInstallment(balanceMinor, state.rateBp, state.monthsLeft),
    };
  }
  if (state.installmentType === "EQUAL") {
    return {
      ...state,
      balanceMinor,
      monthsLeft:
        monthsToRepay(balanceMinor, state.rateBp, state.installmentMinor) ?? state.monthsLeft,
    };
  }
  // Decreasing, shortened: the principal part stays, so fewer installments remain.
  const principalPart = divCeil(state.balanceMinor, BigInt(state.monthsLeft));
  const monthsLeft = Number(divCeil(balanceMinor, principalPart));
  return {
    ...state,
    balanceMinor,
    monthsLeft,
    installmentMinor: decreasingInstallment(balanceMinor, state.rateBp, monthsLeft),
  };
}

export interface ProjectionPoint {
  /** `YYYY-MM` of the installment. */
  month: string;
  balanceMinor: bigint;
}

/** Remaining schedule from `month` (the state's month; first projected installment is the next one). */
export function projectMortgage(
  state: MortgageState,
  month: string,
): { points: ProjectionPoint[]; interestMinor: bigint; lastMonth: string | null } {
  const points: ProjectionPoint[] = [];
  let interestMinor = 0n;
  let current = state;
  let index = 0;
  while (current.balanceMinor > 0n && current.monthsLeft > 0 && index < MAX_MONTHS) {
    index += 1;
    const paid = payInstallment(current);
    interestMinor += paid.interestMinor;
    current = paid.state;
    points.push({ month: addMonths(month, index), balanceMinor: current.balanceMinor });
  }
  return { points, interestMinor, lastMonth: points.at(-1)?.month ?? null };
}

/** Interest no longer owed thanks to an overpayment, comparing both remaining schedules. */
export function interestSaved(before: MortgageState, after: MortgageState, month: string): bigint {
  return maxBig(
    0n,
    projectMortgage(before, month).interestMinor - projectMortgage(after, month).interestMinor,
  );
}

/** Months from `from` to `to` (both `YYYY-MM`), e.g. 2026-10 → 2026-12 = 2. */
export function monthsBetween(from: string, to: string): number {
  const index = (m: string) => Number(m.slice(0, 4)) * 12 + Number(m.slice(5, 7));
  return index(to) - index(from);
}

function divCeil(a: bigint, b: bigint): bigint {
  return (a + b - 1n) / b;
}
