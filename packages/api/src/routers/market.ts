import { schema } from "@pip/db";
import type { PricePoint } from "@pip/engine";
import { fetchYahooDaily, HISTORY_START } from "@pip/sources";
import { TRPCError } from "@trpc/server";
import { eq, max } from "drizzle-orm";
import { z } from "zod";
import { householdProcedure, router } from "../trpc";

const COMPARE_TTL_MS = 60 * 60_000;
const compareCache = new Map<
  string,
  { at: number; currency: string; name: string; points: PricePoint[] }
>();

export const marketRouter = router({
  /** Last stored day per instrument and currency; quotes refresh themselves when pages load. */
  status: householdProcedure.query(async ({ ctx }) => {
    const prices = await ctx.db
      .select({
        instrumentId: schema.instrument.id,
        name: schema.instrument.name,
        type: schema.instrument.type,
        lastDate: max(schema.price.date),
      })
      .from(schema.instrument)
      .leftJoin(schema.price, eq(schema.price.instrumentId, schema.instrument.id))
      .groupBy(schema.instrument.id, schema.instrument.name, schema.instrument.type);
    const fx = await ctx.db
      .select({ currency: schema.fxRate.currency, lastDate: max(schema.fxRate.date) })
      .from(schema.fxRate)
      .groupBy(schema.fxRate.currency);
    return { prices, fx };
  }),

  /**
   * Daily closes of any Yahoo symbol for an optional comparison line on a chart, in its own
   * currency (the chart normalises both lines to % change). Not stored; cached for an hour.
   */
  compare: householdProcedure
    .input(z.object({ symbol: z.string().trim().min(1).max(20) }))
    .query(async ({ input }) => {
      const cached = compareCache.get(input.symbol);
      if (cached && Date.now() - cached.at < COMPARE_TTL_MS) return cached;
      const quote = await fetchYahooDaily(input.symbol, HISTORY_START).catch((error: unknown) => {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nie udało się pobrać ${input.symbol}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
      const entry = { at: Date.now(), ...quote };
      compareCache.set(input.symbol, entry);
      return entry;
    }),
});
