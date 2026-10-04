import { schema, type Tx } from "@pip/db";
import { projectMortgage } from "@pip/engine";
import { sumBig } from "@pip/money";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  addBankEntry,
  entriesOf,
  householdMortgage,
  recomputeMortgage,
  stateAfter,
} from "../mortgages";
import { today } from "../time";
import { householdProcedure, router } from "../trpc";

const money = z.bigint().min(0n).max(1_000_000_000_00n);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const propertyInput = z.object({
  id: z.uuid().nullable(),
  name: z.string().trim().min(1).max(80),
  usage: z.enum(["OWN", "RENTAL"]),
  valueMinor: money,
  valuationDate: z.iso.date(),
  includeInRebalancing: z.boolean(),
  mortgage: z
    .object({
      balanceMinor: money,
      rateBp: z.int().min(0).max(5000),
      installmentType: z.enum(["EQUAL", "DECREASING"]),
      overpaymentMode: z.enum(["SHORTEN", "LOWER_INSTALLMENT"]),
      /** Give the current installment, the month of the last installment, or both. */
      installmentMinor: money.nullable(),
      endMonth: month.nullable(),
    })
    .refine((m) => m.installmentMinor !== null || m.endMonth !== null, {
      message: "Podaj ratę albo miesiąc ostatniej raty.",
    })
    .nullable(),
  rental: z
    .object({
      rentMinor: money,
      costsMinor: money,
      vacancyMonthsPerYear: z.string().regex(/^(1[0-2]|\d)(\.\d{1,2})?$/),
    })
    .nullable(),
});

export const realEstateRouter = router({
  /** Rent paid for the flat you live in, when it is not your own; affects expenses, not the portfolio. */
  updateSettings: householdProcedure
    .input(z.object({ currentRentMinor: money.nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.settings)
        .set({ currentRentMinor: input.currentRentMinor })
        .where(eq(schema.settings.householdId, ctx.householdId));
    }),

  upsertProperty: householdProcedure
    .input(propertyInput)
    .mutation(({ ctx, input }) =>
      ctx.db.transaction((tx) => saveProperty(tx, ctx.householdId, input)),
    ),

  /**
   * „Kupione”: closes an active down-payment goal and records the bought flat in one step,
   * so the plan stops funding the goal and (if counted) starts treating the flat as real estate.
   */
  completeGoal: householdProcedure
    .input(z.object({ goalId: z.uuid(), property: propertyInput }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const closed = await tx
          .update(schema.propertyGoal)
          .set({ status: "DONE" })
          .where(
            and(
              eq(schema.propertyGoal.id, input.goalId),
              eq(schema.propertyGoal.householdId, ctx.householdId),
              eq(schema.propertyGoal.status, "ACTIVE"),
            ),
          )
          .returning({ id: schema.propertyGoal.id });
        if (closed.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego aktywnego celu." });
        }
        return saveProperty(tx, ctx.householdId, { ...input.property, id: null });
      }),
    ),

  /** „Aktualizuj z banku”: the state from a bank statement, after that month's installment. */
  updateMortgageFromBank: householdProcedure
    .input(
      z
        .object({
          propertyId: z.uuid(),
          date: z.iso.date(),
          balanceMinor: money,
          rateBp: z.int().min(0).max(5000),
          installmentMinor: money.nullable(),
          endMonth: month.nullable(),
        })
        .refine((m) => m.installmentMinor !== null || m.endMonth !== null, {
          message: "Podaj ratę albo miesiąc ostatniej raty.",
        }),
    )
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const mortgage = await householdMortgage(tx, ctx.householdId, input.propertyId);
        await addBankEntry(tx, mortgage, input);
      }),
    ),

  /** History, current state and the projected schedule of a property's mortgage. */
  mortgageDetail: householdProcedure
    .input(z.object({ propertyId: z.uuid() }))
    .query(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const mortgage = await householdMortgage(tx, ctx.householdId, input.propertyId);
        const entries = await entriesOf(tx, [mortgage.id]);
        const latest = entries[0];
        const state = latest ? stateAfter(mortgage, latest) : null;
        const projection = latest && state ? projectMortgage(state, latest.date.slice(0, 7)) : null;
        return {
          mortgage,
          monthsLeft: state?.monthsLeft ?? 0,
          payoffMonth: projection?.lastMonth ?? null,
          projectedInterestMinor: projection?.interestMinor ?? 0n,
          paidInterestMinor: sumBig(entries.map((e) => e.interestMinor ?? 0n)),
          interestSavedMinor: sumBig(entries.map((e) => e.interestSavedMinor ?? 0n)),
          entries,
          /** Balance by month: history (oldest first) then the projection. */
          balance: [
            ...[...entries].reverse().map((e) => ({
              month: e.date.slice(0, 7),
              balanceMinor: e.balanceAfterMinor,
              projected: false,
            })),
            ...(projection?.points ?? []).map((p) => ({ ...p, projected: true })),
          ],
        };
      }),
    ),

  /** Removes a mistyped bank state; booked installments and overpayments go through the month ledger. */
  deleteMortgageEntry: householdProcedure
    .input(z.object({ entryId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .select({ entry: schema.mortgageEntry, propertyId: schema.mortgage.propertyId })
          .from(schema.mortgageEntry)
          .innerJoin(schema.mortgage, eq(schema.mortgage.id, schema.mortgageEntry.mortgageId))
          .where(eq(schema.mortgageEntry.id, input.entryId));
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego wpisu." });
        const mortgage = await householdMortgage(tx, ctx.householdId, row.propertyId);
        if (row.entry.kind !== "BANK") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Raty i nadpłaty z planu poprawia się w historii miesięcy.",
          });
        }
        const banks = (await entriesOf(tx, [mortgage.id])).filter((e) => e.kind === "BANK");
        if (banks.length <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "To jedyny stan z banku — popraw go w edycji mieszkania.",
          });
        }
        await tx.delete(schema.mortgageEntry).where(eq(schema.mortgageEntry.id, input.entryId));
        await recomputeMortgage(tx, mortgage.id);
      }),
    ),

  deleteProperty: householdProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(schema.property)
        .where(
          and(eq(schema.property.id, input.id), eq(schema.property.householdId, ctx.householdId)),
        )
        .returning({ id: schema.property.id });
      if (deleted.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego mieszkania." });
      }
    }),

  /** A new goal gets its own cash account, so its progress is the sum of what was paid into it. */
  upsertGoal: householdProcedure
    .input(
      z.object({
        id: z.uuid().nullable(),
        name: z.string().trim().min(1).max(80),
        targetMinor: money.min(1n),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.id) {
        const updated = await ctx.db
          .update(schema.propertyGoal)
          .set({ name: input.name, targetDownPaymentMinor: input.targetMinor })
          .where(
            and(
              eq(schema.propertyGoal.id, input.id),
              eq(schema.propertyGoal.householdId, ctx.householdId),
            ),
          )
          .returning({ id: schema.propertyGoal.id });
        if (updated.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego celu." });
        }
        return { id: input.id };
      }
      return ctx.db.transaction(async (tx) => {
        const [owner] = await tx
          .select({ id: schema.person.id })
          .from(schema.person)
          .where(eq(schema.person.householdId, ctx.householdId))
          .orderBy(asc(schema.person.createdAt))
          .limit(1);
        if (!owner) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Brak osób." });
        const [account] = await tx
          .insert(schema.account)
          .values({
            personId: owner.id,
            name: "Konto oszczędnościowe",
            broker: "Bank",
            wrapper: "CASH",
            currency: "PLN",
          })
          .returning({ id: schema.account.id });
        if (!account) throw new Error("Goal account insert returned nothing");
        const [goal] = await tx
          .insert(schema.propertyGoal)
          .values({
            householdId: ctx.householdId,
            name: input.name,
            targetDownPaymentMinor: input.targetMinor,
            accountId: account.id,
          })
          .returning({ id: schema.propertyGoal.id });
        if (!goal) throw new Error("Goal insert returned nothing");
        return { id: goal.id };
      });
    }),

  setGoalStatus: householdProcedure
    .input(z.object({ id: z.uuid(), status: z.enum(["ACTIVE", "DONE"]) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(schema.propertyGoal)
        .set({ status: input.status })
        .where(
          and(
            eq(schema.propertyGoal.id, input.id),
            eq(schema.propertyGoal.householdId, ctx.householdId),
          ),
        )
        .returning({ id: schema.propertyGoal.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego celu." });
      }
    }),
});

async function saveProperty(tx: Tx, householdId: string, input: z.infer<typeof propertyInput>) {
  const values = {
    name: input.name,
    usage: input.usage,
    valueMinor: input.valueMinor,
    valuationDate: input.valuationDate,
    includeInRebalancing: input.includeInRebalancing,
  };
  let propertyId = input.id;
  if (propertyId) {
    const updated = await tx
      .update(schema.property)
      .set(values)
      .where(and(eq(schema.property.id, propertyId), eq(schema.property.householdId, householdId)))
      .returning({ id: schema.property.id });
    if (updated.length === 0) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego mieszkania." });
    }
  } else {
    const [created] = await tx
      .insert(schema.property)
      .values({ ...values, householdId })
      .returning({ id: schema.property.id });
    if (!created) throw new Error("Property insert returned nothing");
    propertyId = created.id;
  }

  if (input.mortgage) {
    const { installmentType, overpaymentMode, balanceMinor, rateBp, installmentMinor, endMonth } =
      input.mortgage;
    const [existing] = await tx
      .select()
      .from(schema.mortgage)
      .where(eq(schema.mortgage.propertyId, propertyId));
    const [mortgage] = existing
      ? await tx
          .update(schema.mortgage)
          .set({ installmentType, overpaymentMode })
          .where(eq(schema.mortgage.id, existing.id))
          .returning()
      : await tx
          .insert(schema.mortgage)
          .values({
            propertyId,
            balanceMinor,
            rateBp,
            installmentMinor: installmentMinor ?? 0n,
            installmentType,
            overpaymentMode,
          })
          .returning();
    if (!mortgage) throw new Error("Mortgage upsert returned nothing");
    // Changed numbers are a new state from the bank; unchanged ones keep the booked history.
    const changed =
      !existing ||
      existing.balanceMinor !== balanceMinor ||
      existing.rateBp !== rateBp ||
      (installmentMinor !== null && existing.installmentMinor !== installmentMinor) ||
      (endMonth !== null && existing.endMonth !== endMonth);
    if (changed) {
      await addBankEntry(tx, mortgage, {
        date: today(),
        balanceMinor,
        rateBp,
        installmentMinor,
        endMonth,
      });
    } else {
      await recomputeMortgage(tx, mortgage.id);
    }
  } else {
    await tx.delete(schema.mortgage).where(eq(schema.mortgage.propertyId, propertyId));
  }
  if (input.rental) {
    await tx
      .insert(schema.rentalIncome)
      .values({ propertyId, ...input.rental })
      .onConflictDoUpdate({ target: schema.rentalIncome.propertyId, set: input.rental });
  } else {
    await tx.delete(schema.rentalIncome).where(eq(schema.rentalIncome.propertyId, propertyId));
  }
  return { id: propertyId };
}
