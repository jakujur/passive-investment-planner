import { schema } from "@pip/db";
import { bandFor } from "@pip/engine";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { householdAccounts } from "../ownership";
import { householdProcedure, router } from "../trpc";

const money = z.bigint().min(0n).max(1_000_000_000_00n);
const classSetting = z.object({
  weightBp: z.int().min(0).max(10_000),
  /** Explicit ± tolerance of the class share in bp; `null` = the default rule. */
  toleranceBp: z.int().min(0).max(5_000).nullable(),
});

/** Plan settings: contribution, cushion, weights with tolerances and the people in the household. */
export const settingsRouter = router({
  get: householdProcedure.query(async ({ ctx }) => {
    const [settings] = await ctx.db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.householdId, ctx.householdId));
    if (!settings) throw new TRPCError({ code: "NOT_FOUND", message: "Brak ustawień." });
    const classes = await ctx.db
      .select()
      .from(schema.assetClass)
      .where(eq(schema.assetClass.householdId, ctx.householdId));
    const persons = await ctx.db
      .select()
      .from(schema.person)
      .where(eq(schema.person.householdId, ctx.householdId))
      .orderBy(asc(schema.person.createdAt));
    const accounts = await householdAccounts(ctx.db, ctx.householdId);
    return {
      monthlyContributionMinor: settings.monthlyContributionMinor,
      monthlyExpensesMinor: settings.monthlyExpensesMinor,
      cushionMonths: settings.cushionMonths,
      cushionSurplusShareBp: settings.cushionSurplusShareBp,
      alertMonthsThreshold: settings.alertMonthsThreshold,
      etfRounding: settings.etfRounding,
      accountFill: settings.accountFill,
      acceleratorTable: settings.acceleratorTable,
      classes: classes.map((c) => ({
        kind: c.kind,
        name: c.name,
        targetWeightBp: c.targetWeightBp,
        toleranceBp: c.bandAbsBp,
        /** Range used by the plan for the current weight and tolerance. */
        range: bandFor(c.targetWeightBp, c.bandAbsBp === null ? {} : { bandAbsBp: c.bandAbsBp }),
      })),
      persons: persons.map((p) => ({
        id: p.id,
        name: p.name,
        isUser: p.userId === ctx.user.id,
        accounts: accounts
          .filter((a) => a.person.id === p.id)
          .map(({ account }) => ({
            id: account.id,
            name: account.name,
            broker: account.broker,
            wrapper: account.wrapper,
            assetKind: account.assetKind,
            ikzeEntrepreneur: account.ikzeEntrepreneur,
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
        alertMonthsThreshold: z.int().min(1).max(120),
        etfRounding: z.enum(["WHOLE", "FRACTIONAL"]),
        accountFill: z.enum(["EVEN", "SEQUENTIAL"]),
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
          EQUITY: classSetting,
          BONDS: classSetting,
          REAL_ESTATE: classSetting,
          GOLD: classSetting,
        })
        .refine(
          (w) =>
            w.EQUITY.weightBp + w.BONDS.weightBp + w.REAL_ESTATE.weightBp + w.GOLD.weightBp ===
            10_000,
          { message: "Wagi muszą sumować się do 100%." },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        for (const kind of ["EQUITY", "BONDS", "REAL_ESTATE", "GOLD"] as const) {
          await tx
            .update(schema.assetClass)
            .set({ targetWeightBp: input[kind].weightBp, bandAbsBp: input[kind].toleranceBp })
            .where(
              and(
                eq(schema.assetClass.householdId, ctx.householdId),
                eq(schema.assetClass.kind, kind),
              ),
            );
        }
      });
    }),

  addPerson: householdProcedure
    .input(z.object({ name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const [person] = await ctx.db
        .insert(schema.person)
        .values({ householdId: ctx.householdId, name: input.name })
        .returning({ id: schema.person.id });
      return { id: person?.id ?? null };
    }),

  updatePerson: householdProcedure
    .input(z.object({ id: z.uuid(), name: z.string().trim().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(schema.person)
        .set({ name: input.name })
        .where(and(eq(schema.person.id, input.id), eq(schema.person.householdId, ctx.householdId)))
        .returning({ id: schema.person.id });
      if (updated.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej osoby." });
      }
    }),

  /** Only a person without accounts, and never the last one. */
  removePerson: householdProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const persons = await ctx.db
        .select({ id: schema.person.id })
        .from(schema.person)
        .where(eq(schema.person.householdId, ctx.householdId));
      if (!persons.some((p) => p.id === input.id)) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej osoby." });
      }
      if (persons.length === 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Gospodarstwo musi mieć co najmniej jedną osobę.",
        });
      }
      const [owned] = await ctx.db
        .select({ total: count() })
        .from(schema.account)
        .where(eq(schema.account.personId, input.id));
      if ((owned?.total ?? 0) > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Ta osoba ma konta — usuń je lub zostaw osobę.",
        });
      }
      await ctx.db.delete(schema.person).where(eq(schema.person.id, input.id));
    }),
});
