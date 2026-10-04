import { schema } from "@pip/db";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { householdProcedure, router } from "../trpc";

const money = z.bigint().min(0n).max(1_000_000_000_00n);

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
      installmentMinor: money,
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
  upsertProperty: householdProcedure.input(propertyInput).mutation(async ({ ctx, input }) => {
    const values = {
      name: input.name,
      usage: input.usage,
      valueMinor: input.valueMinor,
      valuationDate: input.valuationDate,
      includeInRebalancing: input.includeInRebalancing,
    };
    return ctx.db.transaction(async (tx) => {
      let propertyId = input.id;
      if (propertyId) {
        const updated = await tx
          .update(schema.property)
          .set(values)
          .where(
            and(
              eq(schema.property.id, propertyId),
              eq(schema.property.householdId, ctx.householdId),
            ),
          )
          .returning({ id: schema.property.id });
        if (updated.length === 0) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego mieszkania." });
        }
      } else {
        const [created] = await tx
          .insert(schema.property)
          .values({ ...values, householdId: ctx.householdId })
          .returning({ id: schema.property.id });
        if (!created) throw new Error("Property insert returned nothing");
        propertyId = created.id;
      }

      if (input.mortgage) {
        await tx
          .insert(schema.mortgage)
          .values({ propertyId, ...input.mortgage })
          .onConflictDoUpdate({ target: schema.mortgage.propertyId, set: input.mortgage });
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
    });
  }),

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
            name: `Wkład własny: ${input.name}`,
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
