import { schema } from "@pip/db";
import {
  drawdownBp,
  parseQuantity,
  purchaseValueAt,
  QUANTITY_DIGITS,
  valueSeries,
} from "@pip/engine";
import { parseMoney, sumBig, toDecimalString } from "@pip/money";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { lotMaturityDate } from "../bonds";
import { chartDates, loadQuotes, priceInBaseAt, weeklyDates } from "../market";
import { householdAccounts } from "../ownership";
import { BOND_NOMINAL_MINOR, loadPlanContext, loadPurchases } from "../plan-state";
import { currentMonth, today } from "../time";
import { householdProcedure, router } from "../trpc";

const assetKind = z.enum(["EQUITY", "BONDS", "REAL_ESTATE", "GOLD"]);

/** Strips trailing zeros: 12.50000000 → "12.5". */
function quantityString(scaled: bigint): string {
  return toDecimalString(scaled, QUANTITY_DIGITS).replace(/\.?0+$/, "");
}

export const assetsRouter = router({
  overview: householdProcedure
    .input(z.object({ kind: assetKind }))
    .query(async ({ ctx, input }) => {
      const date = today();
      const [cls] = await ctx.db
        .select()
        .from(schema.assetClass)
        .where(
          and(
            eq(schema.assetClass.householdId, ctx.householdId),
            eq(schema.assetClass.kind, input.kind),
          ),
        );
      if (!cls) throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej klasy aktywów." });

      const context = await loadPlanContext(ctx.db, ctx.householdId, currentMonth());
      const position = context.summary.classes.find((c) => c.id === cls.id) ?? null;
      const accountRows = await householdAccounts(ctx.db, ctx.householdId);
      const accountLabel = (id: string) => {
        const row = accountRows.find((r) => r.account.id === id);
        return row
          ? {
              id,
              name: row.account.name,
              broker: row.account.broker,
              wrapper: row.account.wrapper,
              currency: row.account.currency,
              personId: row.person.id,
              personName: row.person.name,
              ikzeEntrepreneur: row.account.ikzeEntrepreneur,
            }
          : null;
      };
      const instrumentIds = cls.purchaseInstrumentId ? [cls.purchaseInstrumentId] : [];
      const instrumentRows = instrumentIds.length
        ? await ctx.db
            .select()
            .from(schema.instrument)
            .where(inArray(schema.instrument.id, instrumentIds))
        : [];
      const head = {
        classId: cls.id,
        name: cls.name,
        targetWeightBp: cls.targetWeightBp,
        position,
        queue: cls.accountQueue.flatMap((id) => {
          const label = accountLabel(id);
          const limit = context.summary.limits.find((l) => l.accountId === id) ?? null;
          return label ? [{ ...label, limit }] : [];
        }),
        purchaseInstrument: instrumentRows.find((i) => i.id === cls.purchaseInstrumentId) ?? null,
      };

      if (input.kind === "EQUITY" || input.kind === "GOLD") {
        const purchases = (
          await loadPurchases(
            ctx.db,
            accountRows.map((r) => r.account.id),
          )
        ).filter((p) => p.assetKind === input.kind);
        const marketId = cls.purchaseInstrumentId;
        const quotes = await loadQuotes(ctx.db, [
          ...new Set([...purchases.map((p) => p.instrumentId), ...instrumentIds]),
        ]);
        const first = purchases[0]?.date;
        const series = first ? valueSeries(purchases, quotes, weeklyDates(first, date)) : [];

        const holdings = new Map<
          string,
          {
            accountId: string;
            instrumentId: string;
            quantity: bigint;
            costMinor: bigint;
            valueMinor: bigint;
          }
        >();
        for (const p of purchases) {
          const key = `${p.accountId}:${p.instrumentId}`;
          const h = holdings.get(key) ?? {
            accountId: p.accountId,
            instrumentId: p.instrumentId,
            quantity: 0n,
            costMinor: 0n,
            valueMinor: 0n,
          };
          h.quantity += p.quantity ? parseQuantity(p.quantity) : 0n;
          h.costMinor += p.costMinor;
          h.valueMinor += purchaseValueAt(p, quotes.get(p.instrumentId), date);
          holdings.set(key, h);
        }

        const marketQuotes = marketId ? quotes.get(marketId) : undefined;
        const market = marketQuotes
          ? chartDates(marketQuotes.prices[0]?.date ?? date, date).flatMap((d) => {
              const price = priceInBaseAt(marketQuotes, d);
              return price ? [{ date: d, priceMinor: price.priceMinor }] : [];
            })
          : [];

        return {
          ...head,
          kind: input.kind,
          series,
          market,
          lastQuote: priceInBaseAt(marketQuotes, date),
          marketCurrency: instrumentRows.find((i) => i.id === marketId)?.currency ?? "PLN",
          drawdownBp: drawdownBp(marketQuotes?.prices ?? []),
          /** Unit price paid per purchase (PLN), drawn as horizontal lines on the market chart. */
          purchaseMarks: purchases.flatMap((p) => {
            const quantity = p.quantity ? parseQuantity(p.quantity) : 0n;
            if (quantity === 0n) return [];
            return [
              {
                date: p.date,
                quantity: quantityString(quantity),
                unitPriceMinor: (p.costMinor * 10n ** BigInt(QUANTITY_DIGITS)) / quantity,
                accountName: accountLabel(p.accountId)?.name ?? "",
              },
            ];
          }),
          holdings: [...holdings.values()].map((h) => ({
            account: accountLabel(h.accountId),
            instrumentId: h.instrumentId,
            quantity: quantityString(h.quantity),
            costMinor: h.costMinor,
            valueMinor: h.valueMinor,
          })),
        };
      }

      if (input.kind === "BONDS") {
        const accountIds = accountRows.map((r) => r.account.id);
        const lots = accountIds.length
          ? await ctx.db
              .select()
              .from(schema.bondLot)
              .where(inArray(schema.bondLot.accountId, accountIds))
          : [];
        const lotViews = lots
          .map((lot) => {
            const maturityDate = lotMaturityDate(lot.series, lot.purchaseDate);
            return {
              id: lot.id,
              series: lot.series,
              purchaseDate: lot.purchaseDate,
              maturityDate,
              units: lot.units,
              nominalMinor: BigInt(lot.units) * BOND_NOMINAL_MINOR,
              account: accountLabel(lot.accountId),
            };
          })
          .sort((a, b) => a.purchaseDate.localeCompare(b.purchaseDate));
        const maturities = new Map<string, bigint>();
        for (const lot of lotViews) {
          const year = lot.maturityDate.slice(0, 4);
          maturities.set(year, (maturities.get(year) ?? 0n) + lot.nominalMinor);
        }
        const purchases = (await loadPurchases(ctx.db, accountIds)).filter(
          (p) => p.assetKind === "BONDS",
        );
        const first = purchases[0]?.date;
        return {
          ...head,
          kind: input.kind,
          // Valued at nominal until CPI-based EDO valuation arrives, so value equals contributions.
          series: first ? valueSeries(purchases, new Map(), weeklyDates(first, date)) : [],
          lots: lotViews,
          maturities: [...maturities.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([year, nominalMinor]) => ({ year, nominalMinor })),
        };
      }

      const properties = await ctx.db
        .select({
          property: schema.property,
          mortgage: schema.mortgage,
          rental: schema.rentalIncome,
        })
        .from(schema.property)
        .leftJoin(schema.mortgage, eq(schema.mortgage.propertyId, schema.property.id))
        .leftJoin(schema.rentalIncome, eq(schema.rentalIncome.propertyId, schema.property.id))
        .where(eq(schema.property.householdId, ctx.householdId));
      const goals = await ctx.db
        .select()
        .from(schema.propertyGoal)
        .where(eq(schema.propertyGoal.householdId, ctx.householdId))
        .orderBy(schema.propertyGoal.createdAt);
      const goalBalances = goals.length
        ? await ctx.db
            .select({
              accountId: schema.transaction.accountId,
              amountMinor: schema.transaction.amountMinor,
            })
            .from(schema.transaction)
            .where(
              inArray(
                schema.transaction.accountId,
                goals.map((g) => g.accountId),
              ),
            )
        : [];
      const [settings] = await ctx.db
        .select({ currentRentMinor: schema.settings.currentRentMinor })
        .from(schema.settings)
        .where(eq(schema.settings.householdId, ctx.householdId));

      const propertyViews = properties.map(({ property, mortgage, rental }) => {
        const debtMinor = mortgage?.balanceMinor ?? 0n;
        // Vacancy is stored with 2 decimals, so months are counted in hundredths.
        const occupiedHundredths = rental ? 1200n - parseMoney(rental.vacancyMonthsPerYear) : 0n;
        const netAnnualRentMinor = rental
          ? (rental.rentMinor * occupiedHundredths) / 100n - rental.costsMinor * 12n
          : null;
        return {
          ...property,
          financing: mortgage ? ("MORTGAGE" as const) : ("CASH" as const),
          paidOff: debtMinor === 0n,
          mortgage,
          rental,
          equityMinor: property.valueMinor - debtMinor,
          ltvBp: property.valueMinor > 0n ? Number((debtMinor * 10_000n) / property.valueMinor) : 0,
          netAnnualRentMinor,
          netYieldBp:
            netAnnualRentMinor !== null && property.valueMinor > 0n
              ? Number((netAnnualRentMinor * 10_000n) / property.valueMinor)
              : null,
        };
      });

      return {
        ...head,
        kind: input.kind,
        currentRentMinor: settings?.currentRentMinor ?? null,
        properties: propertyViews,
        totals: {
          valueMinor: sumBig(propertyViews.map((p) => p.valueMinor)),
          debtMinor: sumBig(propertyViews.map((p) => p.mortgage?.balanceMinor ?? 0n)),
          equityMinor: sumBig(propertyViews.map((p) => p.equityMinor)),
          netAnnualRentMinor: sumBig(propertyViews.map((p) => p.netAnnualRentMinor ?? 0n)),
        },
        goals: goals.map((g, index) => ({
          id: g.id,
          name: g.name,
          status: g.status,
          targetMinor: g.targetDownPaymentMinor,
          savedMinor: sumBig(
            goalBalances.filter((t) => t.accountId === g.accountId).map((t) => t.amountMinor),
          ),
          /** The plan funds only the oldest active goal. */
          funded: g.status === "ACTIVE" && goals.findIndex((x) => x.status === "ACTIVE") === index,
        })),
      };
    }),

  /** Fill order of the class's own accounts and the instrument the plan buys. */
  updateClass: householdProcedure
    .input(
      z.object({
        kind: z.enum(["EQUITY", "BONDS", "GOLD"]),
        accountQueue: z.array(z.uuid()).max(20),
        purchaseInstrumentId: z.uuid().nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const classAccounts = (await householdAccounts(ctx.db, ctx.householdId))
        .filter((r) => r.account.assetKind === input.kind)
        .map((r) => r.account.id);
      const sameSet =
        input.accountQueue.length === classAccounts.length &&
        new Set(input.accountQueue).size === classAccounts.length &&
        input.accountQueue.every((id) => classAccounts.includes(id));
      if (!sameSet) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Kolejka musi zawierać dokładnie konta tej klasy aktywów.",
        });
      }
      if (input.purchaseInstrumentId) {
        const [instrument] = await ctx.db
          .select({ assetKind: schema.instrument.assetKind })
          .from(schema.instrument)
          .where(eq(schema.instrument.id, input.purchaseInstrumentId));
        if (instrument?.assetKind !== input.kind) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Instrument nie należy do tej klasy aktywów.",
          });
        }
      }
      await ctx.db
        .update(schema.assetClass)
        .set({
          accountQueue: input.accountQueue,
          purchaseInstrumentId: input.purchaseInstrumentId,
        })
        .where(
          and(
            eq(schema.assetClass.householdId, ctx.householdId),
            eq(schema.assetClass.kind, input.kind),
          ),
        );
    }),
});
