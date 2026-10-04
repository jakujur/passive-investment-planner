import { type Db, schema, type Tx } from "@pip/db";
import { type Plan, type PlanItem, planMonth } from "@pip/engine";
import { RATE_SCALE, sumBig } from "@pip/money";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import superjson, { type SuperJSONResult } from "superjson";
import { z } from "zod";
import { bondSeries } from "../bonds";
import { bookMortgages, unbookMortgages } from "../mortgages";
import { loadPlanContext, type PlanContext } from "../plan-state";
import { currentMonth, today } from "../time";
import { householdProcedure, router } from "../trpc";

/** This month's correction of the regular contribution; negative when paying in less. */
const adjustmentInput = z.object({
  adjustmentMinor: z.bigint().min(-1_000_000_000_00n).max(1_000_000_000_00n).default(0n),
});

function surplusFor(contributionMinor: bigint, adjustmentMinor: bigint): bigint {
  const surplus = contributionMinor + adjustmentMinor;
  if (surplus < 0n) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Korekta nie może obniżyć wpłaty poniżej zera.",
    });
  }
  return surplus;
}

interface StoredPlan {
  plan: Plan;
  labels: PlanContext["labels"];
  /** Date the month's transactions carry; older rows fall back to the execution day. */
  date?: string;
}

const warsawDate = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" });

function readStored(row: typeof schema.plan.$inferSelect) {
  const stored = superjson.deserialize<StoredPlan>(row.result as SuperJSONResult);
  return {
    ...stored,
    date: stored.date ?? (row.executedAt ? warsawDate.format(row.executedAt) : `${row.month}-01`),
  };
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

async function bookedPlan(db: Db, householdId: string, planId: string) {
  const [row] = await db
    .select()
    .from(schema.plan)
    .where(
      and(
        eq(schema.plan.id, planId),
        eq(schema.plan.householdId, householdId),
        eq(schema.plan.status, "DONE"),
      ),
    );
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego miesiąca." });
  return row;
}

/** Writes a month's plan items as transactions (and bond lots, mortgage overpayments). */
async function bookItems(
  tx: Tx,
  householdId: string,
  planId: string,
  date: string,
  items: readonly PlanItem[],
  labels: PlanContext["labels"],
) {
  const overpayments = new Map<string, bigint>();
  for (const item of items) {
    switch (item.kind) {
      case "CUSHION":
      case "GOAL":
        await tx.insert(schema.transaction).values({
          accountId: item.accountId,
          planId,
          date,
          type: "DEPOSIT",
          amountMinor: item.amountMinor,
          source: "PLAN",
        });
        break;
      case "OVERPAYMENT":
        overpayments.set(
          item.mortgageId,
          (overpayments.get(item.mortgageId) ?? 0n) + item.amountMinor,
        );
        break;
      case "BUY": {
        await tx.insert(schema.transaction).values({
          accountId: item.accountId,
          planId,
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
            planId,
            date,
            type: "BUY",
            quantity: item.quantity,
            amountMinor: item.accountAmountMinor,
            fxRate:
              item.currency === "PLN" || item.accountAmountMinor === 0n
                ? null
                : (item.amountMinor * RATE_SCALE) / item.accountAmountMinor,
            source: "PLAN",
          })
          .returning({ id: schema.transaction.id });
        const instrument = labels.instruments[item.instrumentId];
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
  // Every mortgage pays its installment in a booked month; overpayments come from the plan.
  await bookMortgages(tx, householdId, planId, date, overpayments);
}

/** Undoes `bookItems`: deletes the month's transactions (lots cascade) and mortgage entries. */
async function unbookItems(tx: Tx, planId: string) {
  await unbookMortgages(tx, planId);
  await tx.delete(schema.transaction).where(eq(schema.transaction.planId, planId));
}

export const planRouter = router({
  /** This month's plan: the booked one, or a fresh one for the regular contribution plus `adjustmentMinor`. */
  current: householdProcedure.input(adjustmentInput).query(async ({ ctx, input }) => {
    const month = currentMonth();
    const done = await doneMonth(ctx.db, ctx.householdId, month);
    if (done) {
      return {
        id: done.id,
        month,
        status: "DONE" as const,
        executedAt: done.executedAt,
        surplusMinor: done.surplusMinor,
        adjustmentMinor: done.extraMinor,
        monthlyContributionMinor: done.surplusMinor - done.extraMinor,
        ...readStored(done),
      };
    }
    const context = await loadPlanContext(ctx.db, ctx.householdId, month);
    const surplusMinor = surplusFor(
      context.settings.monthlyContributionMinor,
      input.adjustmentMinor,
    );
    return {
      id: null,
      month,
      status: "OPEN" as const,
      executedAt: null,
      surplusMinor,
      adjustmentMinor: input.adjustmentMinor,
      monthlyContributionMinor: context.settings.monthlyContributionMinor,
      plan: planMonth(context.state, surplusMinor),
      labels: context.labels,
      date: today(),
    };
  }),

  /** Books the month: recomputes the plan server-side and turns it into transactions. */
  execute: householdProcedure.input(adjustmentInput).mutation(async ({ ctx, input }) => {
    const month = currentMonth();
    if (await doneMonth(ctx.db, ctx.householdId, month)) {
      throw new TRPCError({ code: "CONFLICT", message: "Ten miesiąc jest już zaksięgowany." });
    }
    const context = await loadPlanContext(ctx.db, ctx.householdId, month);
    const surplusMinor = surplusFor(
      context.settings.monthlyContributionMinor,
      input.adjustmentMinor,
    );
    if (surplusMinor === 0n) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Nie ma czego księgować — wpłata 0 zł.",
      });
    }
    const plan = planMonth(context.state, surplusMinor);
    const date = today();

    const planId = await ctx.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.plan)
        .values({
          householdId: ctx.householdId,
          month,
          surplusMinor,
          extraMinor: input.adjustmentMinor,
          carryInMinor: context.state.carryInMinor,
          carryOutMinor: plan.carryOutMinor,
          result: superjson.serialize({
            plan,
            labels: context.labels,
            date,
          } satisfies StoredPlan),
          status: "DONE",
          executedAt: new Date(),
        })
        .returning({ id: schema.plan.id });
      if (!row) throw new Error("Plan insert returned nothing");
      await bookItems(tx, ctx.householdId, row.id, date, plan.items, context.labels);
      return row.id;
    });

    return { planId };
  }),

  /**
   * Only the latest booked month can be undone: its transactions, bond lots and overpayments
   * are reversed and the month is open again (the current month shows its plan anew).
   */
  undo: householdProcedure
    .input(z.object({ planId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const row = await bookedPlan(ctx.db, ctx.householdId, input.planId);
      const [latest] = await ctx.db
        .select({ id: schema.plan.id })
        .from(schema.plan)
        .where(and(eq(schema.plan.householdId, ctx.householdId), eq(schema.plan.status, "DONE")))
        .orderBy(desc(schema.plan.month))
        .limit(1);
      if (latest?.id !== row.id) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cofnąć można tylko ostatni zaksięgowany miesiąc. Starsze miesiące możesz edytować.",
        });
      }
      await ctx.db.transaction(async (tx) => {
        await unbookItems(tx, row.id);
        await tx.delete(schema.plan).where(eq(schema.plan.id, row.id));
      });
      return { month: row.month };
    }),

  /**
   * Corrects a booked month to what was really done: amounts and quantities per line, removed
   * lines and the booking date. The month's transactions are rewritten from the edited lines.
   */
  updateMonth: householdProcedure
    .input(
      z.object({
        planId: z.uuid(),
        date: z.iso.date(),
        lines: z
          .array(
            z.object({
              index: z.int().min(0),
              /** BUY: what was paid in the account currency; other lines: amount in PLN. */
              amountMinor: z.bigint().min(1n).max(1_000_000_000_00n),
              quantity: z
                .string()
                .regex(/^\d+(\.\d{1,8})?$/)
                .nullable(),
            }),
          )
          .refine((lines) => new Set(lines.map((l) => l.index)).size === lines.length, {
            message: "Pozycja powtarza się.",
          }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await bookedPlan(ctx.db, ctx.householdId, input.planId);
      if (!input.date.startsWith(row.month)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Data księgowania musi należeć do miesiąca ${row.month}.`,
        });
      }
      const stored = readStored(row);
      const items: PlanItem[] = input.lines.map((line) => {
        const item = stored.plan.items[line.index];
        if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: "Nie ma takiej pozycji." });
        if (item.kind !== "BUY") return { ...item, amountMinor: line.amountMinor };
        const instrument = stored.labels.instruments[item.instrumentId];
        if (instrument?.type === "BOND" && !/^\d+$/.test(line.quantity ?? "")) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Obligacje kupuje się w całych sztukach.",
          });
        }
        // The base amount follows the paid amount at the rate the line was booked with.
        const amountMinor =
          item.accountAmountMinor === 0n
            ? line.amountMinor
            : (line.amountMinor * item.amountMinor) / item.accountAmountMinor;
        return {
          ...item,
          accountAmountMinor: line.amountMinor,
          amountMinor,
          quantity: line.quantity,
        };
      });
      const plan: Plan = {
        ...stored.plan,
        items,
        allocation: Object.fromEntries(
          Object.keys(stored.plan.allocation).map((classId) => [
            classId,
            sumBig(
              items
                .filter(
                  (i) =>
                    (i.kind === "BUY" && i.classId === classId) ||
                    ((i.kind === "GOAL" || i.kind === "OVERPAYMENT") &&
                      stored.labels.classes[classId]?.kind === "REAL_ESTATE"),
                )
                .map((i) => i.amountMinor),
            ),
          ]),
        ),
      };
      await ctx.db.transaction(async (tx) => {
        await unbookItems(tx, row.id);
        await bookItems(tx, ctx.householdId, row.id, input.date, items, stored.labels);
        await tx
          .update(schema.plan)
          .set({
            result: superjson.serialize({
              plan,
              labels: stored.labels,
              date: input.date,
            } satisfies StoredPlan),
          })
          .where(eq(schema.plan.id, row.id));
      });
    }),

  /** Every booked month with its full plan, newest first — the household's contribution ledger. */
  history: householdProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(schema.plan)
      .where(and(eq(schema.plan.householdId, ctx.householdId), eq(schema.plan.status, "DONE")))
      .orderBy(desc(schema.plan.month));
    return rows.map((row, index) => ({
      id: row.id,
      month: row.month,
      surplusMinor: row.surplusMinor,
      adjustmentMinor: row.extraMinor,
      carryInMinor: row.carryInMinor,
      carryOutMinor: row.carryOutMinor,
      executedAt: row.executedAt,
      /** Only the newest booked month can be undone. */
      canUndo: index === 0,
      ...readStored(row),
    }));
  }),
});
