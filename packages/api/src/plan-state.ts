import { type Db, schema } from "@pip/db";
import {
  type AccountState,
  type AnnualLimits,
  annualLimitMinor,
  type ClassState,
  LIMITS_2026,
  type PlanState,
  type PurchaseInstrument,
  type WrapperFamily,
  wrapperFamily,
} from "@pip/engine";
import { type Currency, maxBig, RATE_SCALE, sumBig, toBase } from "@pip/money";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";

const BOND_NOMINAL_MINOR = 10_000n;

export interface AccountLabel {
  name: string;
  broker: string;
  wrapper: AccountState["wrapper"];
  currency: Currency;
  personName: string;
}

export interface PlanContext {
  state: PlanState;
  labels: {
    accounts: Record<string, AccountLabel>;
    classes: Record<string, { name: string; kind: ClassState["kind"] }>;
    instruments: Record<string, { name: string; ticker: string | null }>;
    goals: Record<string, { name: string }>;
    mortgages: Record<string, { propertyName: string }>;
  };
  summary: {
    cushion: { balanceMinor: bigint; targetMinor: bigint };
    classes: { id: string; name: string; kind: ClassState["kind"]; valueMinor: bigint; targetWeightBp: number }[];
    limits: {
      accountId: string;
      personName: string;
      family: WrapperFamily;
      limitMinor: bigint;
      usedMinor: bigint;
    }[];
  };
}

/** Builds the engine input for a household from transactions; nothing derived is stored. */
export async function loadPlanContext(
  db: Db,
  householdId: string,
  month: string,
): Promise<PlanContext> {
  const year = Number(month.slice(0, 4));
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

  const transactions = accountIds.length
    ? await db
        .select({ tx: schema.transaction, assetKind: schema.instrument.assetKind })
        .from(schema.transaction)
        .leftJoin(schema.instrument, eq(schema.transaction.instrumentId, schema.instrument.id))
        .where(inArray(schema.transaction.accountId, accountIds))
    : [];

  const cashBalance = new Map<string, bigint>();
  const contributedThisYear = new Map<string, bigint>();
  const investedByKind = new Map<string, bigint>();
  for (const { tx, assetKind } of transactions) {
    if (tx.type === "BUY") {
      if (assetKind) {
        const base = toBase(tx.amountMinor, tx.fxRate ?? RATE_SCALE);
        investedByKind.set(assetKind, (investedByKind.get(assetKind) ?? 0n) + base);
      }
      continue;
    }
    cashBalance.set(tx.accountId, (cashBalance.get(tx.accountId) ?? 0n) + tx.amountMinor);
    if (tx.type === "DEPOSIT" && tx.date.startsWith(String(year))) {
      contributedThisYear.set(
        tx.accountId,
        (contributedThisYear.get(tx.accountId) ?? 0n) + tx.amountMinor,
      );
    }
  }

  const limits = await limitsForYear(db, year);
  const fx = await latestFxRates(db);
  const rateFor = (currency: string) => {
    if (currency === "PLN") return RATE_SCALE;
    const rate = fx.get(currency);
    if (!rate) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Brak kursu NBP dla ${currency}.` });
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
      summaryLimits.push({ accountId: account.id, personName: person.name, family, limitMinor, usedMinor });
    }
    return {
      id: account.id,
      wrapper: account.wrapper,
      currency: account.currency,
      fxRate: rateFor(account.currency),
      remainingLimitMinor,
    };
  });

  const classRows = await db
    .select({ cls: schema.assetClass, instrument: schema.instrument })
    .from(schema.assetClass)
    .leftJoin(schema.instrument, eq(schema.assetClass.purchaseInstrumentId, schema.instrument.id))
    .where(eq(schema.assetClass.householdId, householdId));

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
  for (const { cls, instrument } of classRows) {
    let purchase: PurchaseInstrument | undefined;
    if (instrument) {
      instruments[instrument.id] = { name: instrument.name, ticker: instrument.ticker };
      purchase = {
        id: instrument.id,
        type: instrument.type,
        unitPriceMinor:
          instrument.type === "BOND"
            ? BOND_NOMINAL_MINOR
            : await latestPriceInBase(db, instrument.id, rateFor),
      };
    }
    classes.push({
      id: cls.id,
      kind: cls.kind,
      name: cls.name,
      targetWeightBp: cls.targetWeightBp,
      ...(cls.bandAbsBp === null ? {} : { bandAbsBp: cls.bandAbsBp }),
      ...(cls.bandRelBp === null ? {} : { bandRelBp: cls.bandRelBp }),
      valueMinor:
        cls.kind === "REAL_ESTATE" ? realEstateEquity : (investedByKind.get(cls.kind) ?? 0n),
      accountQueue: cls.accountQueue,
      ...(purchase ? { instrument: purchase } : {}),
    });
  }

  const [goal] = await db
    .select()
    .from(schema.propertyGoal)
    .where(
      and(eq(schema.propertyGoal.householdId, householdId), eq(schema.propertyGoal.status, "ACTIVE")),
    )
    .limit(1);
  const mortgageTarget = properties
    .flatMap((p) => (p.mortgage ? [{ ...p.mortgage, propertyName: p.property.name }] : []))
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
    // The peak-to-now drawdown needs index quotes (stage 2); until then the accelerator stays at ×1.0.
    equityDrawdownBp: 0,
    acceleratorTable: settings.acceleratorTable,
    etfRounding: settings.etfRounding,
    alertMonthsThreshold: settings.alertMonthsThreshold,
  };

  return {
    state,
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
      classes: classes.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        valueMinor: c.valueMinor,
        targetWeightBp: c.targetWeightBp,
      })),
      limits: summaryLimits,
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

async function latestFxRates(db: Db): Promise<Map<string, bigint>> {
  const rows = await db
    .selectDistinctOn([schema.fxRate.currency], {
      currency: schema.fxRate.currency,
      rate: schema.fxRate.rate,
    })
    .from(schema.fxRate)
    .orderBy(schema.fxRate.currency, desc(schema.fxRate.date));
  return new Map(rows.map((r) => [r.currency, r.rate]));
}

async function latestPriceInBase(
  db: Db,
  instrumentId: string,
  rateFor: (currency: string) => bigint,
): Promise<bigint | null> {
  const [row] = await db
    .select()
    .from(schema.price)
    .where(eq(schema.price.instrumentId, instrumentId))
    .orderBy(desc(schema.price.date))
    .limit(1);
  return row ? toBase(row.closeMinor, rateFor(row.currency)) : null;
}
