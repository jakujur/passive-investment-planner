import type { Currency } from "@pip/money";

export type Wrapper = "IKE" | "IKE_OBLIGACJE" | "IKZE" | "IKZE_OBLIGACJE" | "REGULAR" | "CASH";

export type AssetClassKind = "EQUITY" | "BONDS" | "REAL_ESTATE" | "GOLD";

export type InstrumentType = "ETF" | "BOND" | "GOLD";

export type EtfRounding = "WHOLE" | "FRACTIONAL";

/** Inclusive weight range in basis points. */
export interface Band {
  lowerBp: number;
  upperBp: number;
}

export interface PurchaseInstrument {
  id: string;
  type: InstrumentType;
  /** Price of one unit in the base currency; `null` when the amount is bought without a quote (e.g. gold by value). */
  unitPriceMinor: bigint | null;
}

export interface ClassState {
  id: string;
  kind: AssetClassKind;
  name: string;
  targetWeightBp: number;
  /** Overrides the default ±500 bp band for weights ≥ 20%. */
  bandAbsBp?: number;
  /** Overrides the default ±25% relative band for weights < 20%. */
  bandRelBp?: number;
  /** Current value in the base currency; for real estate the equity of properties counted in rebalancing. */
  valueMinor: bigint;
  accountQueue: readonly string[];
  instrument?: PurchaseInstrument;
}

export interface AccountState {
  id: string;
  wrapper: Wrapper;
  currency: Currency;
  /** Base currency per 1 unit of the account currency, scaled by RATE_SCALE. */
  fxRate: bigint;
  /** Contribution room left this calendar year in the base currency; `null` = no limit. */
  remainingLimitMinor: bigint | null;
}

export interface AcceleratorStep {
  /** The step applies from this drawdown of the equity index from its peak (in bp, 1500 = −15%). */
  minDrawdownBp: number;
  multiplierBp: number;
}

export interface PlanState {
  /** `YYYY-MM` */
  month: string;
  /** Cash left over from rounding in the previous plan. */
  carryInMinor: bigint;
  cushion: {
    accountId: string;
    balanceMinor: bigint;
    targetMinor: bigint;
    /** Share of the surplus sent to the cushion while it is below target (10 000 = all of it). */
    surplusShareBp: number;
  };
  classes: readonly ClassState[];
  accounts: readonly AccountState[];
  realEstate: {
    goal: { id: string; accountId: string; remainingMinor: bigint } | null;
    /** Mortgage on a property counted in rebalancing that receives overpayments. */
    mortgage: { id: string; balanceMinor: bigint } | null;
  };
  equityDrawdownBp: number;
  acceleratorTable: readonly AcceleratorStep[];
  etfRounding: EtfRounding;
  alertMonthsThreshold: number;
}

export type PlanItem =
  | { kind: "CUSHION"; accountId: string; amountMinor: bigint }
  | { kind: "GOAL"; goalId: string; accountId: string; amountMinor: bigint }
  | { kind: "OVERPAYMENT"; mortgageId: string; amountMinor: bigint }
  | {
      kind: "BUY";
      classId: string;
      accountId: string;
      instrumentId: string;
      /** In the base currency. */
      amountMinor: bigint;
      /** What to transfer, in the account currency. */
      accountAmountMinor: bigint;
      currency: Currency;
      /** Decimal string; `null` when bought by value without a quote. */
      quantity: string | null;
    };

export interface Rationale {
  /** `CUSHION`, `REAL_ESTATE` or an asset class id. */
  subject: string;
  text: string;
}

export type Alert =
  | {
      type: "OUT_OF_BAND";
      classId: string;
      weightBp: number;
      band: Band;
      /** `null` when there is no monthly contribution to close the gap at all. */
      monthsToReturn: number | null;
    }
  | { type: "REAL_ESTATE_CONCENTRATION"; classId: string; weightBp: number; band: Band }
  | { type: "NO_ACCOUNT_CAPACITY"; classId: string; unplacedMinor: bigint };

export interface Plan {
  month: string;
  surplusMinor: bigint;
  items: PlanItem[];
  rationale: Rationale[];
  alerts: Alert[];
  /** Base-currency amount per asset class before mapping to accounts and rounding. */
  allocation: Record<string, bigint>;
  carryOutMinor: bigint;
}
