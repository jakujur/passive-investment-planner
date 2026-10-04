import { type Db, schema } from "@pip/db";
import {
  type AccountState,
  type AnnualLimits,
  annualLimitMinor,
  type ClassPosition,
  type ClassState,
  classPositions,
  drawdownBp,
  LIMITS_2026,
  type PlanState,
  type Purchase,
  type PurchaseInstrument,
  purchaseValueAt,
  type WrapperFamily,
  wrapperFamily,
} from "@pip/engine";
import { type Currency, maxBig, RATE_SCALE, sumBig, toBase } from "@pip/money";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { loadQuotes, priceInBaseAt } from "./market";
import { today } from "./time";

export const BOND_NOMINAL_MINOR = 10_000n;

export interface AccountLabel {
  name: string;
  broker: string;
  wrapper: AccountState["wrapper"];
  currency: Currency;
  personName: string;
}

export interface PlanContext {
  state: PlanState;
  settings: { monthlyContributionMinor: bigint };
  labels: {
    accounts: Record<string, AccountLabel>;
    classes: Record<string, { name: string; kind: ClassState["kind"] }>;
    instruments: Record<
      string,
      { name: string; ticker: string | null; type: "ETF" | "BOND" | "GOLD" }
    >;
    goals: Record<string, { name: string }>;
    mortgages: Record<string, { propertyName: string }>;
  };
  summary: {
    cushion: { balanceMinor: bigint; targetMinor: bigint };
    classes: (ClassPosition & {
      id: string;
      name: string;
      kind: ClassState["kind"];
      targetWeightBp: number;
    })[];
    limits: {
      accountId: string;
      personName: string;
      family: WrapperFamily;
      limitMinor: bigint;
      usedMinor: bigint;
    }[];
    equityDrawdownBp: number;
  };
}

/** BUY transactions of a household as engine purchases, in the base currency. */
export async function loadPurchases(db: Db, accountIds: readonly string[]) {
  if (accountIds.length === 0) return [];
  const rows = await db
    .select({ tx: schema.transaction, assetKind: schema.instrument.assetKind })
    .from(schema.transaction)
    .innerJoin(schema.instrument, eq(schema.transaction.instrumentId, schema.instrument.id))
    .where(
      and(
        inArray(schema.transaction.accountId, [...accountIds]),
        eq(schema.transaction.type, "BUY"),
      ),
    )
    .orderBy(asc(schema.transaction.date));
  return rows.map(
    ({ tx, assetKind }): Purchase & { accountId: string; assetKind: typeof assetKind } => ({
      date: tx.date,
      instrumentId: tx.instrumentId ?? "",
      quantity: tx.quantity,
      costMinor: toBase(tx.amountMinor, tx.fxRate ?? RATE_SCALE),
      accountId: tx.accountId,
      assetKind,
    }),
  );
}

/** Builds the engine input for a household from transactions and quotes; nothing derived is stored. */
export async function loadPlanContext(
  db: Db,
  householdId: string,
  month: string,
): Promise<PlanContext> {
  const year = Number(month.slice(0, 4));
  const date = today();
  const [settings] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.householdId, householdId));
  if (!settings?.cushionAccountId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brak ustawień gospodarstwa." });
  }

  const accountRows = await db
    .select({ account: schema.account, person: schema.person })
    .from(schema.account)
    .innerJoin(schema.person, eq(schema.account.personId, schema.person.id))
    .where(eq(schema.person.householdId, householdId));
  const accountIds = accountRows.map((r) => r.account.id);

  const cashRows = accountIds.length
    ? await db
        .select({
          accountId: schema.transaction.accountId,
          type: schema.transaction.type,
          date: schema.transaction.date,
          amountMinor: schema.transaction.amountMinor,
        })
        .from(schema.transaction)
        .where(inArray(schema.transaction.accountId, accountIds))
    : [];
  const cashBalance = new Map<string, bigint>();
  const contributedThisYear = new Map<string, bigint>();
  for (const tx of cashRows) {
    if (tx.type === "BUY") continue;
    cashBalance.set(tx.accountId, (cashBalance.get(tx.accountId) ?? 0n) + tx.amountMinor);
    if (tx.type === "DEPOSIT" && tx.date.startsWith(String(year))) {
      contributedThisYear.set(
        tx.accountId,
        (contributedThisYear.get(tx.accountId) ?? 0n) + tx.amountMinor,
      );
    }
  }

  const classRows = await db
    .select({ cls: schema.assetClass, instrument: schema.instrument })
    .from(schema.assetClass)
    .leftJoin(schema.instrument, eq(schema.assetClass.purchaseInstrumentId, schema.instrument.id))
    .where(eq(schema.assetClass.householdId, householdId));

  const purchases = await loadPurchases(db, accountIds);
  const quoteIds = new Set(purchases.map((p) => p.instrumentId));
  for (const { cls } of classRows) {
    if (cls.purchaseInstrumentId) quoteIds.add(cls.purchaseInstrumentId);
    if (cls.benchmarkInstrumentId) quoteIds.add(cls.benchmarkInstrumentId);
  }
  const quotes = await loadQuotes(db, [...quoteIds]);
  const valueByKind = new Map<string, bigint>();
  for (const purchase of purchases) {
    // Bonds stay at nominal until CPI-based EDO valuation arrives (stage 2).
    const value =
      purchase.assetKind === "BONDS"
        ? purchase.costMinor
        : purchaseValueAt(purchase, quotes.get(purchase.instrumentId), date);
    valueByKind.set(purchase.assetKind, (valueByKind.get(purchase.assetKind) ?? 0n) + value);
  }

  const limits = await limitsForYear(db, year);
  const fx = await latestFxRates(db);
  const rateFor = (currency: string) => {
    if (currency === "PLN") return RATE_SCALE;
    const rate = fx.get(currency);
    if (!rate) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: `Brak kursu NBP dla ${currency} — odśwież notowania.`,
      });
    }
    return rate;
  };

  const summaryLimits: PlanContext["summary"]["limits"] = [];
  const accounts: AccountState[] = accountRows.map(({ account, person }) => {
    const family = wrapperFamily(account.wrapper);
    let remainingLimitMinor: bigint | null = null;
    if (family) {
      const limitMinor = annualLimitMinor(family, person.isEntrepreneur, limits);
      const usedMinor = contributedThisYear.get(account.id) ?? 0n;
      remainingLimitMinor = maxBig(0n, limitMinor - usedMinor);
      summaryLimits.push({
        accountId: account.id,
        personName: person.name,
        family,
        limitMinor,
        usedMinor,
      });
    }
    return {
      id: account.id,
      wrapper: account.wrapper,
      currency: account.currency,
      fxRate: rateFor(account.currency),
      remainingLimitMinor,
    };
  });

  const properties = await db
    .select({ property: schema.property, mortgage: schema.mortgage })
    .from(schema.property)
    .leftJoin(schema.mortgage, eq(schema.mortgage.propertyId, schema.property.id))
    .where(
      and(
        eq(schema.property.householdId, householdId),
        eq(schema.property.includeInRebalancing, true),
      ),
    );
  const realEstateEquity = sumBig(
    properties.map((p) => p.property.valueMinor - (p.mortgage?.balanceMinor ?? 0n)),
  );

  const classes: ClassState[] = [];
  const instruments: PlanContext["labels"]["instruments"] = {};
  let equityDrawdownBp = 0;
  for (const { cls, instrument } of classRows) {
    let purchase: PurchaseInstrument | undefined;
    if (instrument) {
      instruments[instrument.id] = {
        name: instrument.name,
        ticker: instrument.ticker,
        type: instrument.type,
      };
      purchase = {
        id: instrument.id,
        type: instrument.type,
        unitPriceMinor:
          instrument.type === "BOND"
            ? BOND_NOMINAL_MINOR
            : (priceInBaseAt(quotes.get(instrument.id), date)?.priceMinor ?? null),
      };
    }
    if (cls.kind === "EQUITY" && cls.benchmarkInstrumentId) {
      equityDrawdownBp = drawdownBp(quotes.get(cls.benchmarkInstrumentId)?.prices ?? []);
    }
    classes.push({
      id: cls.id,
      kind: cls.kind,
      name: cls.name,
      targetWeightBp: cls.targetWeightBp,
      ...(cls.bandAbsBp === null ? {} : { bandAbsBp: cls.bandAbsBp }),
      ...(cls.bandRelBp === null ? {} : { bandRelBp: cls.bandRelBp }),
      valueMinor: cls.kind === "REAL_ESTATE" ? realEstateEquity : (valueByKind.get(cls.kind) ?? 0n),
      accountQueue: cls.accountQueue,
      ...(purchase ? { instrument: purchase } : {}),
    });
  }

  const [goal] = await db
    .select()
    .from(schema.propertyGoal)
    .where(
      and(
        eq(schema.propertyGoal.householdId, householdId),
        eq(schema.propertyGoal.status, "ACTIVE"),
      ),
    )
    .orderBy(asc(schema.propertyGoal.createdAt))
    .limit(1);
  const mortgageTarget = properties
    .flatMap((p) =>
      p.mortgage && p.mortgage.balanceMinor > 0n
        ? [{ ...p.mortgage, propertyName: p.property.name }]
        : [],
    )
    .sort((a, b) => b.rateBp - a.rateBp)[0];

  const [lastDone] = await db
    .select({ carryOutMinor: schema.plan.carryOutMinor })
    .from(schema.plan)
    .where(and(eq(schema.plan.householdId, householdId), eq(schema.plan.status, "DONE")))
    .orderBy(desc(schema.plan.executedAt))
    .limit(1);

  const cushionBalance = cashBalance.get(settings.cushionAccountId) ?? 0n;
  const cushionTarget = settings.monthlyExpensesMinor * BigInt(settings.cushionMonths);

  const state: PlanState = {
    month,
    carryInMinor: lastDone?.carryOutMinor ?? 0n,
    cushion: {
      accountId: settings.cushionAccountId,
      balanceMinor: cushionBalance,
      targetMinor: cushionTarget,
      surplusShareBp: settings.cushionSurplusShareBp,
    },
    classes,
    accounts,
    realEstate: {
      goal: goal
        ? {
            id: goal.id,
            accountId: goal.accountId,
            remainingMinor: maxBig(
              0n,
              goal.targetDownPaymentMinor - (cashBalance.get(goal.accountId) ?? 0n),
            ),
          }
        : null,
      mortgage: mortgageTarget
        ? { id: mortgageTarget.id, balanceMinor: mortgageTarget.balanceMinor }
        : null,
    },
    equityDrawdownBp,
    acceleratorTable: settings.acceleratorTable,
    etfRounding: settings.etfRounding,
    alertMonthsThreshold: settings.alertMonthsThreshold,
  };

  const positions = new Map(classPositions(classes).map((p) => [p.classId, p]));
  return {
    state,
    settings: { monthlyContributionMinor: settings.monthlyContributionMinor },
    labels: {
      accounts: Object.fromEntries(
        accountRows.map(({ account, person }) => [
          account.id,
          {
            name: account.name,
            broker: account.broker,
            wrapper: account.wrapper,
            currency: account.currency,
            personName: person.name,
          },
        ]),
      ),
      classes: Object.fromEntries(classes.map((c) => [c.id, { name: c.name, kind: c.kind }])),
      instruments,
      goals: goal ? { [goal.id]: { name: goal.name } } : {},
      mortgages: mortgageTarget
        ? { [mortgageTarget.id]: { propertyName: mortgageTarget.propertyName } }
        : {},
    },
    summary: {
      cushion: { balanceMinor: cushionBalance, targetMinor: cushionTarget },
      classes: classes.map((c) => {
        const position = positions.get(c.id);
        return {
          classId: c.id,
          valueMinor: c.valueMinor,
          weightBp: position?.weightBp ?? null,
          effectiveTargetBp: position?.effectiveTargetBp ?? null,
          band: position?.band ?? null,
          id: c.id,
          name: c.name,
          kind: c.kind,
          targetWeightBp: c.targetWeightBp,
        };
      }),
      limits: summaryLimits,
      equityDrawdownBp,
    },
  };
}

interface LimitsSnapshot {
  ikeMinor: string;
  ikzeMinor: string;
  ikzeEntrepreneurMinor: string;
}

/** Manual or fetched snapshot for the year; the 2026 announcement is built in. */
async function limitsForYear(db: Db, year: number): Promise<AnnualLimits> {
  const [snapshot] = await db
    .select()
    .from(schema.dataSnapshot)
    .where(
      and(
        eq(schema.dataSnapshot.sourceId, "limits"),
        eq(schema.dataSnapshot.key, String(year)),
        inArray(schema.dataSnapshot.status, ["OK", "MANUAL"]),
      ),
    )
    .orderBy(desc(schema.dataSnapshot.fetchedAt))
    .limit(1);
  if (snapshot) {
    const value = snapshot.value as LimitsSnapshot;
    return {
      year,
      ikeMinor: BigInt(value.ikeMinor),
      ikzeMinor: BigInt(value.ikzeMinor),
      ikzeEntrepreneurMinor: BigInt(value.ikzeEntrepreneurMinor),
    };
  }
  if (year === LIMITS_2026.year) return LIMITS_2026;
  throw new TRPCError({
    code: "PRECONDITION_FAILED",
    message: `Brak limitów IKE/IKZE na rok ${year}.`,
  });
}

export async function latestFxRates(db: Db): Promise<Map<string, bigint>> {
  const rows = await db
    .selectDistinctOn([schema.fxRate.currency], {
      currency: schema.fxRate.currency,
      rate: schema.fxRate.rate,
    })
    .from(schema.fxRate)
    .orderBy(schema.fxRate.currency, desc(schema.fxRate.date));
  return new Map(rows.map((r) => [r.currency, r.rate]));
}
