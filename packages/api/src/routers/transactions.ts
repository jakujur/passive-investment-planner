import { schema } from "@pip/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { bondSeries } from "../bonds";
import { householdAccount, householdAccounts } from "../ownership";
import { householdProcedure, router } from "../trpc";

const isoDate = z.iso.date();

export const transactionsRouter = router({
  list: householdProcedure
    .input(
      z.object({
        assetKind: z.enum(["EQUITY", "BONDS", "GOLD"]).optional(),
        accountId: z.uuid().optional(),
        limit: z.int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accounts = await householdAccounts(ctx.db, ctx.householdId);
      const accountIds = accounts.map((a) => a.account.id);
      if (accountIds.length === 0) return [];
      const rows = await ctx.db
        .select({ tx: schema.transaction, instrument: schema.instrument })
        .from(schema.transaction)
        .leftJoin(schema.instrument, eq(schema.transaction.instrumentId, schema.instrument.id))
        .where(
          and(
            inArray(schema.transaction.accountId, accountIds),
            input.accountId ? eq(schema.transaction.accountId, input.accountId) : undefined,
            input.assetKind ? eq(schema.instrument.assetKind, input.assetKind) : undefined,
          ),
        )
        .orderBy(desc(schema.transaction.date), desc(schema.transaction.createdAt))
        .limit(input.limit);
      return rows.map(({ tx, instrument }) => {
        const owner = accounts.find((a) => a.account.id === tx.accountId);
        return {
          id: tx.id,
          date: tx.date,
          type: tx.type,
          source: tx.source,
          quantity: tx.quantity,
          amountMinor: tx.amountMinor,
          currency: owner?.account.currency ?? "PLN",
          accountId: tx.accountId,
          accountName: owner?.account.name ?? "",
          personName: owner?.person.name ?? "",
          instrumentName: instrument?.name ?? null,
          instrumentTicker: instrument?.ticker ?? null,
        };
      });
    }),

  /** Manual, possibly backdated entry. A BUY can carry its deposit, which counts toward IKE/IKZE limits. */
  create: householdProcedure
    .input(
      z
        .object({
          accountId: z.uuid(),
          type: z.enum(["BUY", "DEPOSIT", "FEE", "INTEREST"]),
          date: isoDate,
          instrumentId: z.uuid().nullable(),
          quantity: z
            .string()
            .regex(/^\d+(\.\d{1,8})?$/)
            .nullable(),
          amountMinor: z.bigint().min(1n).max(1_000_000_000_00n),
          alsoDeposit: z.boolean().default(false),
        })
        .refine((t) => t.type !== "BUY" || (t.instrumentId !== null && t.quantity !== null), {
          message: "Zakup wymaga instrumentu i ilości.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await householdAccount(ctx.db, ctx.householdId, input.accountId);
      const [instrument] = input.instrumentId
        ? await ctx.db
            .select()
            .from(schema.instrument)
            .where(eq(schema.instrument.id, input.instrumentId))
        : [];
      if (input.instrumentId && !instrument) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego instrumentu." });
      }
      if (instrument?.type === "BOND" && !/^\d+$/.test(input.quantity ?? "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Obligacje kupuje się w całych sztukach.",
        });
      }

      let fxRate: bigint | null = null;
      if (account.currency !== "PLN") {
        const [rate] = await ctx.db
          .select({ rate: schema.fxRate.rate })
          .from(schema.fxRate)
          .where(
            and(eq(schema.fxRate.currency, account.currency), lte(schema.fxRate.date, input.date)),
          )
          .orderBy(desc(schema.fxRate.date))
          .limit(1);
        if (!rate) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Brak kursu NBP ${account.currency} na ${input.date} — odśwież notowania.`,
          });
        }
        fxRate = rate.rate;
      }

      await ctx.db.transaction(async (tx) => {
        const base = { accountId: account.id, date: input.date, source: "MANUAL" as const };
        if (input.type === "BUY" && input.alsoDeposit) {
          await tx
            .insert(schema.transaction)
            .values({ ...base, type: "DEPOSIT", amountMinor: input.amountMinor });
        }
        const [row] = await tx
          .insert(schema.transaction)
          .values({
            ...base,
            type: input.type,
            instrumentId: input.type === "BUY" ? input.instrumentId : null,
            quantity: input.type === "BUY" ? input.quantity : null,
            amountMinor: input.type === "FEE" ? -input.amountMinor : input.amountMinor,
            fxRate: input.type === "BUY" ? fxRate : null,
          })
          .returning({ id: schema.transaction.id });
        if (row && input.type === "BUY" && instrument?.type === "BOND" && instrument.ticker) {
          await tx.insert(schema.bondLot).values({
            accountId: account.id,
            transactionId: row.id,
            series: bondSeries(instrument.ticker, input.date),
            purchaseDate: input.date,
            units: Number(input.quantity),
          });
        }
      });
    }),

  /** Only manual entries; booked plans stay as they were executed. */
  delete: householdProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ accountId: schema.transaction.accountId, source: schema.transaction.source })
      .from(schema.transaction)
      .where(eq(schema.transaction.id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej transakcji." });
    await householdAccount(ctx.db, ctx.householdId, row.accountId);
    if (row.source !== "MANUAL") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Można usuwać tylko transakcje dodane ręcznie.",
      });
    }
    await ctx.db.delete(schema.transaction).where(eq(schema.transaction.id, input.id));
  }),
});
