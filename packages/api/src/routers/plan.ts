import { type Db, schema } from "@pip/db";
import { type Plan, planMonth } from "@pip/engine";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import superjson, { type SuperJSONResult } from "superjson";
import { z } from "zod";
import { bondSeries } from "../bonds";
import { loadPlanContext, type PlanContext } from "../plan-state";
import { currentMonth, today } from "../time";
import { householdProcedure, router } from "../trpc";

const extraInput = z.object({ extraMinor: z.bigint().min(0n).max(1_000_000_000_00n).default(0n) });

interface StoredPlan {
  plan: Plan;
  labels: PlanContext["labels"];
}

async function doneMonth(db: Db, householdId: string, month: string) {
  const [row] = await db
    .select()
    .from(schema.plan)
    .where(
      and(
        eq(schema.plan.householdId, householdId),
        eq(schema.plan.month, month),
        eq(schema.plan.status, "DONE"),
      ),
    )
    .limit(1);
  return row;
}

export const planRouter = router({
  /** This month's plan: the booked one, or a fresh one for the regular contribution plus `extraMinor`. */
  current: householdProcedure.input(extraInput).query(async ({ ctx, input }) => {
    const month = currentMonth();
    const done = await doneMonth(ctx.db, ctx.householdId, month);
    if (done) {
      const stored = superjson.deserialize<StoredPlan>(done.result as SuperJSONResult);
      return {
        month,
        status: "DONE" as const,
        executedAt: done.executedAt,
        surplusMinor: done.surplusMinor,
        extraMinor: done.extraMinor,
        monthlyContributionMinor: done.surplusMinor - done.extraMinor,
        ...stored,
      };
    }
    const context = await loadPlanContext(ctx.db, ctx.householdId, month);
    const surplusMinor = context.settings.monthlyContributionMinor + input.extraMinor;
    return {
      month,
      status: "OPEN" as const,
      executedAt: null,
      surplusMinor,
      extraMinor: input.extraMinor,
      monthlyContributionMinor: context.settings.monthlyContributionMinor,
      plan: planMonth(context.state, surplusMinor),
      labels: context.labels,
    };
  }),

  /** Books the month: recomputes the plan server-side and turns it into transactions. */
  execute: householdProcedure.input(extraInput).mutation(async ({ ctx, input }) => {
    const month = currentMonth();
    if (await doneMonth(ctx.db, ctx.householdId, month)) {
      throw new TRPCError({ code: "CONFLICT", message: "Ten miesiąc jest już zaksięgowany." });
    }
    const context = await loadPlanContext(ctx.db, ctx.householdId, month);
    const surplusMinor = context.settings.monthlyContributionMinor + input.extraMinor;
    if (surplusMinor === 0n) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Nie ma czego księgować — wpłata 0 zł.",
      });
    }
    const plan = planMonth(context.state, surplusMinor);
    const accounts = new Map(context.state.accounts.map((a) => [a.id, a]));
    const date = today();

    const planId = await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.plan)
        .values({
          householdId: ctx.householdId,
          month,
          surplusMinor,
          extraMinor: input.extraMinor,
          carryInMinor: context.state.carryInMinor,
          carryOutMinor: plan.carryOutMinor,
          result: superjson.serialize({ plan, labels: context.labels } satisfies StoredPlan),
          status: "DONE",
          executedAt: new Date(),
        })
        .returning({ id: schema.plan.id });
      if (!row) throw new Error("Plan insert returned nothing");

      for (const item of plan.items) {
        switch (item.kind) {
          case "CUSHION":
          case "GOAL":
            await tx.insert(schema.transaction).values({
              accountId: item.accountId,
              planId: row.id,
              date,
              type: "DEPOSIT",
              amountMinor: item.amountMinor,
              source: "PLAN",
            });
            break;
          case "OVERPAYMENT":
            await tx
              .update(schema.mortgage)
              .set({ balanceMinor: sql`${schema.mortgage.balanceMinor} - ${item.amountMinor}` })
              .where(eq(schema.mortgage.id, item.mortgageId));
            break;
          case "BUY": {
            const fxRate = accounts.get(item.accountId)?.fxRate ?? null;
            await tx.insert(schema.transaction).values({
              accountId: item.accountId,
              planId: row.id,
              date,
              type: "DEPOSIT",
              amountMinor: item.accountAmountMinor,
              source: "PLAN",
            });
            const [buy] = await tx
              .insert(schema.transaction)
              .values({
                accountId: item.accountId,
                instrumentId: item.instrumentId,
                planId: row.id,
                date,
                type: "BUY",
                quantity: item.quantity,
                amountMinor: item.accountAmountMinor,
                fxRate: item.currency === "PLN" ? null : fxRate,
                source: "PLAN",
              })
              .returning({ id: schema.transaction.id });
            const instrument = context.labels.instruments[item.instrumentId];
            if (buy && instrument?.type === "BOND" && instrument.ticker && item.quantity) {
              await tx.insert(schema.bondLot).values({
                accountId: item.accountId,
                transactionId: buy.id,
                series: bondSeries(instrument.ticker, date),
                purchaseDate: date,
                units: Number(item.quantity),
              });
            }
            break;
          }
        }
      }
      return row.id;
    });

    return { planId };
  }),

  history: householdProcedure.query(async ({ ctx }) =>
    ctx.db
      .select({
        id: schema.plan.id,
        month: schema.plan.month,
        surplusMinor: schema.plan.surplusMinor,
        extraMinor: schema.plan.extraMinor,
        carryOutMinor: schema.plan.carryOutMinor,
        executedAt: schema.plan.executedAt,
      })
      .from(schema.plan)
      .where(and(eq(schema.plan.householdId, ctx.householdId), eq(schema.plan.status, "DONE")))
      .orderBy(desc(schema.plan.month)),
  ),
});
