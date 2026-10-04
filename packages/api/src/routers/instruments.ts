import { schema } from "@pip/db";
import { fetchYahooDaily, refreshMarketData, searchYahooSymbols } from "@pip/sources";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { householdProcedure, router } from "../trpc";

const CURRENCIES = ["PLN", "EUR", "USD", "GBP", "CHF"] as const;
type SupportedCurrency = (typeof CURRENCIES)[number];
const isSupportedCurrency = (c: string): c is SupportedCurrency => CURRENCIES.some((s) => s === c);

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

  /** Yahoo symbol search (funds and shares), marking symbols already in the catalogue. */
  search: householdProcedure
    .input(z.object({ query: z.string().trim().min(1).max(80) }))
    .query(async ({ ctx, input }) => {
      const hits = await searchYahooSymbols(input.query);
      if (hits.length === 0) return [];
      const known = await ctx.db
        .select({ id: schema.instrument.id, quoteSymbol: schema.instrument.quoteSymbol })
        .from(schema.instrument)
        .where(
          inArray(
            schema.instrument.quoteSymbol,
            hits.map((h) => h.symbol),
          ),
        );
      return hits.map((hit) => ({
        ...hit,
        instrumentId: known.find((k) => k.quoteSymbol === hit.symbol)?.id ?? null,
      }));
    }),

  /**
   * Makes a searched symbol the instrument the equity plan buys: adds it to the catalogue
   * with its price history (and NBP rates for a new currency) when needed.
   */
  selectForEquity: householdProcedure
    .input(z.object({ symbol: z.string().trim().min(1).max(20) }))
    .mutation(async ({ ctx, input }) => {
      let [instrument] = await ctx.db
        .select({ id: schema.instrument.id })
        .from(schema.instrument)
        .where(eq(schema.instrument.quoteSymbol, input.symbol));
      if (!instrument) {
        const since = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
        const quote = await fetchYahooDaily(input.symbol, since).catch((error: unknown) => {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Nie udało się pobrać notowań ${input.symbol}: ${error instanceof Error ? error.message : String(error)}`,
          });
        });
        if (!isSupportedCurrency(quote.currency) || quote.points.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${input.symbol}: brak notowań albo nieobsługiwana waluta ${quote.currency}.`,
          });
        }
        [instrument] = await ctx.db
          .insert(schema.instrument)
          .values({
            ticker: input.symbol.split(".")[0] ?? input.symbol,
            name: quote.name,
            type: "ETF",
            assetKind: "EQUITY",
            currency: quote.currency,
            quoteSymbol: input.symbol,
          })
          .returning({ id: schema.instrument.id });
        await refreshMarketData(ctx.db);
      }
      if (!instrument) throw new Error("Instrument insert returned nothing");
      await ctx.db
        .update(schema.assetClass)
        .set({ purchaseInstrumentId: instrument.id })
        .where(
          and(
            eq(schema.assetClass.householdId, ctx.householdId),
            eq(schema.assetClass.kind, "EQUITY"),
          ),
        );
      return { id: instrument.id };
    }),
});
