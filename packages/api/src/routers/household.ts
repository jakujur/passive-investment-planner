import { schema, type Tx } from "@pip/db";
import { DEFAULT_ACCELERATOR_TABLE } from "@pip/engine";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { ACCOUNT_LAYOUTS, LAYOUTS } from "../layouts";
import { loadPlanContext } from "../plan-state";
import { currentMonth, today } from "../time";
import { householdProcedure, protectedProcedure, publicProcedure, router } from "../trpc";

const money = z.bigint().min(0n).max(1_000_000_000_00n);

export const bootstrapInput = z
  .object({
    householdName: z.string().trim().min(1).max(80),
    layout: z.enum(ACCOUNT_LAYOUTS),
    persons: z
      .array(z.object({ name: z.string().trim().min(1).max(60), isEntrepreneur: z.boolean() }))
      .min(1)
      .max(2),
    monthlyContributionMinor: money,
    monthlyExpensesMinor: money,
    cushionMonths: z.int().min(0).max(36),
    cushionBalanceMinor: money,
    downPayment: z
      .object({
        name: z.string().trim().min(1).max(80),
        targetMinor: money.min(1n),
        savedMinor: money,
      })
      .nullable(),
  })
  .refine((input) => input.persons.length === LAYOUTS[input.layout].persons, {
    message: "Liczba osób nie pasuje do wybranego układu kont.",
    path: ["persons"],
  });

export const householdRouter = router({
  /** Registration is open only until the first user exists. */
  setupStatus: publicProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select({ total: count() }).from(schema.user);
    return { hasUsers: (row?.total ?? 0) > 0 };
  }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [membership] = await ctx.db
      .select({
        householdId: schema.household.id,
        householdName: schema.household.name,
        role: schema.householdMember.role,
      })
      .from(schema.householdMember)
      .innerJoin(schema.household, eq(schema.householdMember.householdId, schema.household.id))
      .where(eq(schema.householdMember.userId, ctx.user.id))
      .limit(1);
    return {
      user: { name: ctx.user.name, email: ctx.user.email },
      membership: membership ?? null,
    };
  }),

  layouts: publicProcedure.query(() =>
    ACCOUNT_LAYOUTS.map((id) => {
      const { title, summary, persons, accounts, queues } = LAYOUTS[id];
      const nameOf = (key: string) => {
        const account = accounts.find((a) => a.key === key);
        return account ? `${account.name} (${account.broker})` : key;
      };
      return {
        id,
        title,
        summary,
        persons,
        equityQueue: queues.EQUITY.map(nameOf),
        bondsQueue: queues.BONDS.map(nameOf),
      };
    }),
  ),

  bootstrap: protectedProcedure.input(bootstrapInput).mutation(async ({ ctx, input }) => {
    const [existing] = await ctx.db
      .select({ householdId: schema.householdMember.householdId })
      .from(schema.householdMember)
      .where(eq(schema.householdMember.userId, ctx.user.id))
      .limit(1);
    if (existing) {
      throw new TRPCError({ code: "CONFLICT", message: "Należysz już do gospodarstwa." });
    }

    const blueprint = LAYOUTS[input.layout];
    return ctx.db.transaction(async (tx) => {
      const [household] = await tx
        .insert(schema.household)
        .values({ name: input.householdName })
        .returning();
      if (!household) throw new Error("Household insert returned nothing");
      await tx
        .insert(schema.householdMember)
        .values({ householdId: household.id, userId: ctx.user.id, role: "OWNER" });

      const persons = await tx
        .insert(schema.person)
        .values(
          input.persons.map((p, i) => ({
            householdId: household.id,
            name: p.name,
            isEntrepreneur: p.isEntrepreneur,
            userId: i === 0 ? ctx.user.id : null,
          })),
        )
        .returning({ id: schema.person.id });
      const personId = (index: number) => {
        const id = persons[index]?.id;
        if (!id) throw new Error(`Missing person ${index}`);
        return id;
      };

      const accounts = await tx
        .insert(schema.account)
        .values(
          blueprint.accounts.map((a) => ({
            personId: personId(a.personIndex),
            name: a.name,
            broker: a.broker,
            wrapper: a.wrapper,
            currency: "PLN" as const,
          })),
        )
        .returning({ id: schema.account.id });
      const accountId = new Map(blueprint.accounts.map((a, i) => [a.key, accounts[i]?.id ?? ""]));
      const queue = (keys: string[]) => keys.map((key) => accountId.get(key) ?? "");

      const instruments = await ensureInstruments(tx);
      await tx.insert(schema.assetClass).values([
        {
          householdId: household.id,
          kind: "EQUITY",
          name: "Akcje",
          targetWeightBp: 4500,
          benchmarkInstrumentId: instruments.acwi,
          purchaseInstrumentId: instruments.acwi,
          accountQueue: queue(blueprint.queues.EQUITY),
        },
        {
          householdId: household.id,
          kind: "BONDS",
          name: "Obligacje",
          targetWeightBp: 2500,
          purchaseInstrumentId: instruments.edo,
          accountQueue: queue(blueprint.queues.BONDS),
        },
        {
          householdId: household.id,
          kind: "REAL_ESTATE",
          name: "Nieruchomości",
          targetWeightBp: 2500,
        },
        {
          householdId: household.id,
          kind: "GOLD",
          name: "Złoto",
          targetWeightBp: 500,
          purchaseInstrumentId: instruments.gold,
          accountQueue: queue(blueprint.queues.GOLD),
        },
      ]);

      const cushionAccountId = accountId.get("cushion") ?? null;
      await tx.insert(schema.settings).values({
        householdId: household.id,
        monthlyContributionMinor: input.monthlyContributionMinor,
        monthlyExpensesMinor: input.monthlyExpensesMinor,
        cushionMonths: input.cushionMonths,
        cushionAccountId,
        acceleratorTable: [...DEFAULT_ACCELERATOR_TABLE],
      });

      const date = today();
      if (cushionAccountId && input.cushionBalanceMinor > 0n) {
        await tx.insert(schema.transaction).values({
          accountId: cushionAccountId,
          date,
          type: "DEPOSIT",
          amountMinor: input.cushionBalanceMinor,
          source: "MANUAL",
        });
      }

      if (input.downPayment) {
        const [goalAccount] = await tx
          .insert(schema.account)
          .values({
            personId: personId(0),
            name: "Wkład własny",
            broker: "Bank",
            wrapper: "CASH",
            currency: "PLN",
          })
          .returning({ id: schema.account.id });
        if (!goalAccount) throw new Error("Goal account insert returned nothing");
        await tx.insert(schema.propertyGoal).values({
          householdId: household.id,
          name: input.downPayment.name,
          targetDownPaymentMinor: input.downPayment.targetMinor,
          accountId: goalAccount.id,
        });
        if (input.downPayment.savedMinor > 0n) {
          await tx.insert(schema.transaction).values({
            accountId: goalAccount.id,
            date,
            type: "DEPOSIT",
            amountMinor: input.downPayment.savedMinor,
            source: "MANUAL",
          });
        }
      }

      return { householdId: household.id };
    });
  }),

  overview: householdProcedure.query(async ({ ctx }) => {
    const { labels, summary } = await loadPlanContext(ctx.db, ctx.householdId, currentMonth());
    return { labels, summary };
  }),
});

/** Global instruments shared by all households; created on first use. */
async function ensureInstruments(tx: Tx) {
  const find = async (type: "ETF" | "BOND" | "GOLD", ticker: string) => {
    const [row] = await tx
      .select({ id: schema.instrument.id })
      .from(schema.instrument)
      .where(and(eq(schema.instrument.type, type), eq(schema.instrument.ticker, ticker)))
      .limit(1);
    return row?.id;
  };
  const ensure = async (values: typeof schema.instrument.$inferInsert & { ticker: string }) => {
    const found = await find(values.type, values.ticker);
    if (found) return found;
    const [row] = await tx
      .insert(schema.instrument)
      .values(values)
      .returning({ id: schema.instrument.id });
    if (!row) throw new Error(`Instrument insert returned nothing: ${values.ticker}`);
    return row.id;
  };
  return {
    acwi: await ensure({
      isin: "IE00B6R52259",
      ticker: "IUSQ",
      name: "iShares MSCI ACWI UCITS ETF (Acc)",
      type: "ETF",
      assetKind: "EQUITY",
      currency: "EUR",
      quoteSymbol: "IUSQ.DE",
    }),
    edo: await ensure({
      ticker: "EDO",
      name: "Obligacje 10-letnie EDO",
      type: "BOND",
      assetKind: "BONDS",
      currency: "PLN",
    }),
    gold: await ensure({
      ticker: "XAU",
      name: "Złoto (1 g)",
      type: "GOLD",
      assetKind: "GOLD",
      currency: "PLN",
    }),
  };
}
