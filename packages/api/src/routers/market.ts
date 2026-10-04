import { schema } from "@pip/db";
import { refreshMarketData } from "@pip/sources";
import { eq, max } from "drizzle-orm";
import { householdProcedure, router } from "../trpc";

export const marketRouter = router({
  /** Last stored day per instrument and currency; the UI flags anything older than a few days. */
  status: householdProcedure.query(async ({ ctx }) => {
    const prices = await ctx.db
      .select({
        instrumentId: schema.instrument.id,
        name: schema.instrument.name,
        lastDate: max(schema.price.date),
      })
      .from(schema.instrument)
      .leftJoin(schema.price, eq(schema.price.instrumentId, schema.instrument.id))
      .groupBy(schema.instrument.id, schema.instrument.name);
    const fx = await ctx.db
      .select({ currency: schema.fxRate.currency, lastDate: max(schema.fxRate.date) })
      .from(schema.fxRate)
      .groupBy(schema.fxRate.currency);
    return { prices, fx };
  }),

  refresh: householdProcedure.mutation(({ ctx }) => refreshMarketData(ctx.db)),
});
