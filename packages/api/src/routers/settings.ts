import { schema } from "@pip/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { householdAccounts } from "../ownership";
import { householdProcedure, router } from "../trpc";

const money = z.bigint().min(0n).max(1_000_000_000_00n);

export const settingsRouter = router({
  get: householdProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.householdId, ctx.householdId));
    if (!settings) throw new TRPCError({ code: "NOT_FOUND", message: "Brak ustawień." });
    const classes = await ctx.db
      .select({
        kind: schema.assetClass.kind,
        name: schema.assetClass.name,
        targetWeightBp: schema.assetClass.targetWeightBp,
      })
      .from(schema.assetClass)
      .where(eq(schema.assetClass.householdId, ctx.householdId));
    const persons = await ctx.db
      .select()
      .from(schema.person)
      .where(eq(schema.person.householdId, ctx.householdId));
    const accounts = await householdAccounts(ctx.db, ctx.householdId);
    return {
      monthlyContributionMinor: settings.monthlyContributionMinor,
      monthlyExpensesMinor: settings.monthlyExpensesMinor,
      cushionMonths: settings.cushionMonths,
      cushionSurplusShareBp: settings.cushionSurplusShareBp,
      currentRentMinor: settings.currentRentMinor,
      alertMonthsThreshold: settings.alertMonthsThreshold,
      etfRounding: settings.etfRounding,
      acceleratorTable: settings.acceleratorTable,
      classes,
      persons: persons.map((p) => ({
        id: p.id,
        name: p.name,
        isEntrepreneur: p.isEntrepreneur,
        accounts: accounts
          .filter((a) => a.person.id === p.id)
          .map(({ account }) => ({
            id: account.id,
            name: account.name,
            broker: account.broker,
            wrapper: account.wrapper,
            currency: account.currency,
          })),
      })),
    };
  }),

  update: householdProcedure
    .input(
      z.object({
        monthlyContributionMinor: money,
        monthlyExpensesMinor: money,
        cushionMonths: z.int().min(0).max(36),
        cushionSurplusShareBp: z.int().min(0).max(10_000),
        currentRentMinor: money.nullable(),
        alertMonthsThreshold: z.int().min(1).max(120),
        etfRounding: z.enum(["WHOLE", "FRACTIONAL"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(schema.settings)
        .set(input)
        .where(eq(schema.settings.householdId, ctx.householdId));
    }),

  updateWeights: householdProcedure
    .input(
      z
        .object({
          EQUITY: z.int().min(0).max(10_000),
          BONDS: z.int().min(0).max(10_000),
          REAL_ESTATE: z.int().min(0).max(10_000),
          GOLD: z.int().min(0).max(10_000),
        })
        .refine((w) => w.EQUITY + w.BONDS + w.REAL_ESTATE + w.GOLD === 10_000, {
          message: "Wagi muszą sumować się do 100%.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const [kind, targetWeightBp] of Object.entries(input) as [
          keyof typeof input,
          number,
        ][]) {
          await tx
            .update(schema.assetClass)
            .set({ targetWeightBp })
            .where(
              and(
                eq(schema.assetClass.householdId, ctx.householdId),
                eq(schema.assetClass.kind, kind),
              ),
            );
        }
      });
    }),

  updatePerson: householdProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(60),
        isEntrepreneur: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(schema.person)
        .set({ name: input.name, isEntrepreneur: input.isEntrepreneur })
        .where(and(eq(schema.person.id, input.id), eq(schema.person.householdId, ctx.householdId)))
        .returning({ id: schema.person.id });
      if (updated.length === 0)
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej osoby." });
    }),
});
