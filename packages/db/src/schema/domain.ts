import type { Currency } from "@pip/money";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

/** Money columns: smallest currency unit, read as JS bigint. */
const minor = () => bigint({ mode: "bigint" });
/** FX rates scaled by 10^6 (see RATE_SCALE in @pip/money). */
const scaledRate = () => bigint({ mode: "bigint" });
const id = () => uuid().primaryKey().defaultRandom();
const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const memberRole = pgEnum("member_role", ["OWNER", "MEMBER"]);
export const wrapper = pgEnum("wrapper", [
  "IKE",
  "IKE_OBLIGACJE",
  "IKZE",
  "IKZE_OBLIGACJE",
  "REGULAR",
  "CASH",
]);
export const assetKind = pgEnum("asset_kind", ["EQUITY", "BONDS", "REAL_ESTATE", "GOLD"]);
export const instrumentType = pgEnum("instrument_type", ["ETF", "BOND", "GOLD"]);
export const transactionType = pgEnum("transaction_type", ["BUY", "DEPOSIT", "FEE", "INTEREST"]);
export const transactionSource = pgEnum("transaction_source", [
  "MANUAL",
  "IMPORT",
  "PLAN",
  "OPENING",
]);
export const propertyUsage = pgEnum("property_usage", ["OWN", "RENTAL"]);
export const goalStatus = pgEnum("goal_status", ["ACTIVE", "DONE"]);
export const planStatus = pgEnum("plan_status", ["DRAFT", "DONE"]);
export const etfRounding = pgEnum("etf_rounding", ["WHOLE", "FRACTIONAL"]);
export const accountFill = pgEnum("account_fill", ["EVEN", "SEQUENTIAL"]);
export const installmentType = pgEnum("installment_type", ["EQUAL", "DECREASING"]);
export const overpaymentMode = pgEnum("overpayment_mode", ["SHORTEN", "LOWER_INSTALLMENT"]);
export const mortgageEntryKind = pgEnum("mortgage_entry_kind", [
  "BANK",
  "INSTALLMENT",
  "OVERPAYMENT",
]);
export const snapshotStatus = pgEnum("snapshot_status", ["OK", "PENDING_REVIEW", "MANUAL"]);

// ── Household & access ────────────────────────────────────────────────────────

export const household = pgTable("household", {
  id: id(),
  name: text().notNull(),
  baseCurrency: text().notNull().default("PLN"),
  createdAt: createdAt(),
});

export const householdMember = pgTable(
  "household_member",
  {
    householdId: uuid()
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: memberRole().notNull().default("MEMBER"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.householdId, t.userId] }), uniqueIndex().on(t.userId)],
);

export const householdInvite = pgTable("household_invite", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  email: text().notNull(),
  tokenHash: text().notNull().unique(),
  invitedBy: text()
    .notNull()
    .references(() => user.id),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  acceptedAt: timestamp({ withTimezone: true }),
  createdAt: createdAt(),
});

export const person = pgTable("person", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  userId: text().references(() => user.id, { onDelete: "set null" }),
  name: text().notNull(),
  createdAt: createdAt(),
});

// ── Portfolio structure ───────────────────────────────────────────────────────

export const instrument = pgTable("instrument", {
  id: id(),
  isin: text().unique(),
  ticker: text(),
  name: text().notNull(),
  type: instrumentType().notNull(),
  assetKind: assetKind().notNull(),
  currency: text().$type<Currency>().notNull(),
  /** Symbol at the daily-quotes source (Yahoo chart API), e.g. `IUSQ.DE`; gold is priced by NBP. */
  quoteSymbol: text(),
});

export const assetClass = pgTable(
  "asset_class",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    kind: assetKind().notNull(),
    name: text().notNull(),
    targetWeightBp: integer().notNull(),
    bandAbsBp: integer(),
    bandRelBp: integer(),
    purchaseInstrumentId: uuid().references(() => instrument.id),
    /** Ordered account ids filled up to their limits, the last one should have no limit. */
    accountQueue: uuid().array().notNull().default(sql`'{}'::uuid[]`),
  },
  (t) => [
    uniqueIndex().on(t.householdId, t.kind),
    check("asset_class_weight_range", sql`${t.targetWeightBp} between 0 and 10000`),
  ],
);

export const account = pgTable(
  "account",
  {
    id: id(),
    personId: uuid()
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    name: text().notNull(),
    broker: text().notNull(),
    wrapper: wrapper().notNull(),
    /** IKE and IKE-Obligacje share one legal slot per person, same for IKZE. */
    wrapperFamily: text().generatedAlwaysAs(
      sql`case when wrapper in ('IKE', 'IKE_OBLIGACJE') then 'IKE' when wrapper in ('IKZE', 'IKZE_OBLIGACJE') then 'IKZE' end`,
    ),
    currency: text().$type<Currency>().notNull(),
    /** The asset class this account serves; `null` for cash (cushion, down-payment goals). */
    assetKind: assetKind(),
    /** IKZE of a person running a business has the higher limit. */
    ikzeEntrepreneur: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("account_one_wrapper_family_per_person")
      .on(t.personId, t.wrapperFamily)
      .where(sql`${t.wrapperFamily} is not null`),
    check(
      "account_tax_wrapper_in_pln",
      sql`${t.wrapper} in ('REGULAR', 'CASH') or ${t.currency} = 'PLN'`,
    ),
  ],
);

export const transaction = pgTable(
  "transaction",
  {
    id: id(),
    accountId: uuid()
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    instrumentId: uuid().references(() => instrument.id),
    planId: uuid().references(() => plan.id, { onDelete: "set null" }),
    date: date().notNull(),
    type: transactionType().notNull(),
    quantity: numeric({ precision: 20, scale: 8 }),
    priceMinor: minor(),
    fxRate: scaledRate(),
    /** In the account currency; positive for money in, negative for fees. */
    amountMinor: minor().notNull(),
    source: transactionSource().notNull(),
    /** Broker operation id, used to deduplicate imports. */
    externalId: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.accountId, t.date), uniqueIndex().on(t.accountId, t.externalId)],
);

export const bondLot = pgTable("bond_lot", {
  id: id(),
  accountId: uuid()
    .notNull()
    .references(() => account.id, { onDelete: "cascade" }),
  /** The BUY that created the lot; deleting the transaction removes the lot. */
  transactionId: uuid().references(() => transaction.id, { onDelete: "cascade" }),
  series: text().notNull(),
  purchaseDate: date().notNull(),
  units: integer().notNull(),
});

// ── Real estate ──────────────────────────────────────────────────────────────

export const property = pgTable("property", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  name: text().notNull(),
  usage: propertyUsage().notNull(),
  valueMinor: minor().notNull(),
  valuationDate: date().notNull(),
  includeInRebalancing: boolean().notNull().default(false),
});

/** Terms plus the current state, which is a cache of the latest `mortgage_entry`. */
export const mortgage = pgTable("mortgage", {
  id: id(),
  propertyId: uuid()
    .notNull()
    .unique()
    .references(() => property.id, { onDelete: "cascade" }),
  balanceMinor: minor().notNull(),
  rateBp: integer().notNull(),
  installmentMinor: minor().notNull(),
  installmentType: installmentType().notNull().default("EQUAL"),
  overpaymentMode: overpaymentMode().notNull().default("SHORTEN"),
  /** `YYYY-MM` of the last installment. */
  endMonth: text(),
});

/**
 * Mortgage history and source of truth: BANK = state typed from the bank (after that month's
 * installment), INSTALLMENT / OVERPAYMENT = written when a month is booked.
 */
export const mortgageEntry = pgTable(
  "mortgage_entry",
  {
    id: id(),
    mortgageId: uuid()
      .notNull()
      .references(() => mortgage.id, { onDelete: "cascade" }),
    planId: uuid().references(() => plan.id, { onDelete: "cascade" }),
    kind: mortgageEntryKind().notNull(),
    date: date().notNull(),
    /** Installment or overpayment paid; null for BANK. */
    amountMinor: minor(),
    principalMinor: minor(),
    interestMinor: minor(),
    /** Future interest no longer owed thanks to an overpayment. */
    interestSavedMinor: minor(),
    balanceAfterMinor: minor().notNull(),
    rateBp: integer().notNull(),
    /** Next installment after this entry. */
    installmentMinor: minor().notNull(),
    endMonth: text(),
    /** Insertion order; entries of one booking share `createdAt` (same transaction). */
    seq: bigint({ mode: "number" }).generatedAlwaysAsIdentity(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.mortgageId, t.date)],
);

export const rentalIncome = pgTable("rental_income", {
  propertyId: uuid()
    .primaryKey()
    .references(() => property.id, { onDelete: "cascade" }),
  rentMinor: minor().notNull(),
  costsMinor: minor().notNull(),
  vacancyMonthsPerYear: numeric({ precision: 4, scale: 2 }).notNull().default("1"),
});

export const propertyGoal = pgTable("property_goal", {
  id: id(),
  householdId: uuid()
    .notNull()
    .references(() => household.id, { onDelete: "cascade" }),
  name: text().notNull(),
  targetDownPaymentMinor: minor().notNull(),
  accountId: uuid()
    .notNull()
    .references(() => account.id),
  status: goalStatus().notNull().default("ACTIVE"),
  /** The oldest active goal is the one the monthly plan funds. */
  createdAt: createdAt(),
});

// ── Settings & plans ─────────────────────────────────────────────────────────

export const settings = pgTable("settings", {
  householdId: uuid()
    .primaryKey()
    .references(() => household.id, { onDelete: "cascade" }),
  monthlyExpensesMinor: minor().notNull().default(sql`0`),
  /** Regular monthly surplus the plan is computed for; a month can add an extra amount on top. */
  monthlyContributionMinor: minor().notNull().default(sql`0`),
  cushionMonths: integer().notNull().default(9),
  cushionAccountId: uuid().references(() => account.id),
  cushionSurplusShareBp: integer().notNull().default(10_000),
  currentRentMinor: minor(),
  /** `AcceleratorStep[]` from @pip/engine. */
  acceleratorTable: jsonb().$type<{ minDrawdownBp: number; multiplierBp: number }[]>().notNull(),
  alertMonthsThreshold: integer().notNull().default(12),
  etfRounding: etfRounding().notNull().default("FRACTIONAL"),
  /** EVEN: every month a share to each tax account at the pace of its yearly limit; SEQUENTIAL: fill one by one. */
  accountFill: accountFill().notNull().default("EVEN"),
});

export const plan = pgTable(
  "plan",
  {
    id: id(),
    householdId: uuid()
      .notNull()
      .references(() => household.id, { onDelete: "cascade" }),
    /** `YYYY-MM` */
    month: text().notNull(),
    surplusMinor: minor().notNull(),
    /** Correction of the regular monthly contribution for this month (negative when paying less). */
    extraMinor: minor().notNull().default(sql`0`),
    carryInMinor: minor().notNull().default(sql`0`),
    carryOutMinor: minor().notNull().default(sql`0`),
    /** `{ plan, labels }` serialized with superjson, so bigints survive. */
    result: jsonb().notNull(),
    status: planStatus().notNull().default("DRAFT"),
    createdAt: createdAt(),
    executedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    index().on(t.householdId, t.month),
    uniqueIndex("plan_one_done_per_month")
      .on(t.householdId, t.month)
      .where(sql`${t.status} = 'DONE'`),
  ],
);

// ── Market data (global, written by the worker) ──────────────────────────────

export const price = pgTable(
  "price",
  {
    instrumentId: uuid()
      .notNull()
      .references(() => instrument.id, { onDelete: "cascade" }),
    date: date().notNull(),
    closeMinor: minor().notNull(),
    currency: text().$type<Currency>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.date] })],
);

export const fxRate = pgTable(
  "fx_rate",
  {
    currency: text().$type<Currency>().notNull(),
    date: date().notNull(),
    rate: scaledRate().notNull(),
  },
  (t) => [primaryKey({ columns: [t.currency, t.date] })],
);

export const dataSnapshot = pgTable(
  "data_snapshot",
  {
    id: id(),
    sourceId: text().notNull(),
    key: text().notNull(),
    value: jsonb().notNull(),
    effectiveFrom: date().notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    status: snapshotStatus().notNull(),
  },
  (t) => [index().on(t.sourceId, t.key, t.effectiveFrom)],
);
