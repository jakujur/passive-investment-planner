import { schema } from "@pip/db";
import { fetchYahooDaily } from "@pip/sources";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { householdProcedure, router } from "../trpc";

export const instrumentsRouter = router({
  list: householdProcedure
    .input(z.object({ assetKind: z.enum(["EQUITY", "BONDS", "GOLD"]).optional() }))
    .query(async ({ ctx, input }) =>
      ctx.db
        .select()
        .from(schema.instrument)
        .where(input.assetKind ? eq(schema.instrument.assetKind, input.assetKind) : undefined)
        .orderBy(asc(schema.instrument.name)),
    ),

  /** Adds an ETF to the shared catalogue after checking its quote symbol actually returns closes. */
  createEtf: householdProcedure
    .input(
      z.object({
        isin: z.string().regex(/^[A-Z]{2}[A-Z0-9]{9}\d$/, "Nieprawidłowy ISIN"),
        ticker: z.string().trim().min(1).max(12),
        name: z.string().trim().min(1).max(120),
        currency: z.enum(["PLN", "EUR", "USD", "GBP", "CHF"]),
        quoteSymbol: z.string().trim().min(1).max(20),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
      const quote = await fetchYahooDaily(input.quoteSymbol, since).catch((error: unknown) => {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nie udało się pobrać notowań ${input.quoteSymbol}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
      if (quote.currency !== input.currency || quote.points.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${input.quoteSymbol} jest notowany w ${quote.currency}, a nie w ${input.currency}.`,
        });
      }
      const [row] = await ctx.db
        .insert(schema.instrument)
        .values({ ...input, type: "ETF", assetKind: "EQUITY" })
        .onConflictDoNothing({ target: schema.instrument.isin })
        .returning({ id: schema.instrument.id });
      if (!row) throw new TRPCError({ code: "CONFLICT", message: "Ten ISIN już jest w katalogu." });
      return { id: row.id };
    }),
});
