import { type Db, schema } from "@pip/db";
import type { FxPoint, PricePoint } from "@pip/engine";
import type { Currency } from "@pip/money";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { dropOutliers, isoDate } from "./http";
import { fetchNbpFx, fetchNbpGold } from "./nbp";
import { fetchYahooDaily } from "./yahoo";

/** Enough history for multi-year charts and the equity drawdown from its peak. */
export const HISTORY_START = "2016-01-01";
const MAX_FX_CHANGE_BP = 1_000n;
const MAX_PRICE_CHANGE_BP = 2_000n;

export interface SourceReport {
  source: "NBP_FX" | "NBP_GOLD" | "YAHOO";
  key: string;
  stored: number;
  rejected: number;
  lastDate: string | null;
  error: string | null;
}

/**
 * Pulls NBP rates, NBP gold and ETF closes since the last stored day (inclusive, so an
 * intraday quote stored earlier gets replaced by the close). One failing source never
 * stops the others; its error is returned in the report.
 */
export async function refreshMarketData(db: Db): Promise<SourceReport[]> {
  const today = isoDate(new Date());
  const reports: SourceReport[] = [];

  const run = async (
    source: SourceReport["source"],
    key: string,
    job: () => Promise<Omit<SourceReport, "source" | "key" | "error">>,
  ) => {
    try {
      reports.push({ source, key, error: null, ...(await job()) });
    } catch (error) {
      reports.push({
        source,
        key,
        stored: 0,
        rejected: 0,
        lastDate: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const currencies = await db
    .selectDistinct({ currency: schema.instrument.currency })
    .from(schema.instrument)
    .where(ne(schema.instrument.currency, "PLN"))
    .union(
      db
        .selectDistinct({ currency: schema.account.currency })
        .from(schema.account)
        .where(ne(schema.account.currency, "PLN")),
    );
  for (const { currency } of currencies) {
    await run("NBP_FX", currency, async () => {
      const last = await lastFx(db, currency);
      const points = await fetchNbpFx(currency, last?.date ?? HISTORY_START, today);
      const { accepted, rejected } = dropOutliers(
        points,
        (p) => p.rate,
        MAX_FX_CHANGE_BP,
        last?.rate ?? null,
      );
      await storeFx(db, currency, accepted);
      return {
        stored: accepted.length,
        rejected: rejected.length,
        lastDate: accepted.at(-1)?.date ?? last?.date ?? null,
      };
    });
  }

  const instruments = await db.select().from(schema.instrument);
  for (const instrument of instruments) {
    if (instrument.type === "GOLD") {
      await run("NBP_GOLD", instrument.name, async () => {
        const last = await lastPrice(db, instrument.id);
        const points = await fetchNbpGold(last?.date ?? HISTORY_START, today);
        return storeChecked(db, instrument.id, "PLN", points, last);
      });
    } else if (instrument.type === "ETF" && instrument.quoteSymbol) {
      const symbol = instrument.quoteSymbol;
      await run("YAHOO", symbol, async () => {
        const last = await lastPrice(db, instrument.id);
        const { currency, points } = await fetchYahooDaily(symbol, last?.date ?? HISTORY_START);
        if (currency !== instrument.currency) {
          throw new Error(`${symbol} notowany w ${currency}, instrument ma ${instrument.currency}`);
        }
        return storeChecked(db, instrument.id, instrument.currency, points, last);
      });
    }
  }

  return reports;
}

async function storeChecked(
  db: Db,
  instrumentId: string,
  currency: Currency,
  points: PricePoint[],
  last: PricePoint | undefined,
) {
  // The last stored point is re-fetched on purpose; compare against the one before it.
  const previous = last ? await priceBefore(db, instrumentId, last.date) : undefined;
  const { accepted, rejected } = dropOutliers(
    points,
    (p) => p.closeMinor,
    MAX_PRICE_CHANGE_BP,
    previous?.closeMinor ?? null,
  );
  for (const batch of chunk(accepted, 500)) {
    await db
      .insert(schema.price)
      .values(
        batch.map((p) => ({ instrumentId, date: p.date, closeMinor: p.closeMinor, currency })),
      )
      .onConflictDoUpdate({
        target: [schema.price.instrumentId, schema.price.date],
        set: { closeMinor: sql`excluded.close_minor` },
      });
  }
  return {
    stored: accepted.length,
    rejected: rejected.length,
    lastDate: accepted.at(-1)?.date ?? last?.date ?? null,
  };
}

async function storeFx(db: Db, currency: Currency, points: FxPoint[]) {
  for (const batch of chunk(points, 500)) {
    await db
      .insert(schema.fxRate)
      .values(batch.map((p) => ({ currency, date: p.date, rate: p.rate })))
      .onConflictDoUpdate({
        target: [schema.fxRate.currency, schema.fxRate.date],
        set: { rate: sql`excluded.rate` },
      });
  }
}

async function lastFx(db: Db, currency: Currency): Promise<FxPoint | undefined> {
  const [row] = await db
    .select({ date: schema.fxRate.date, rate: schema.fxRate.rate })
    .from(schema.fxRate)
    .where(eq(schema.fxRate.currency, currency))
    .orderBy(desc(schema.fxRate.date))
    .limit(1);
  return row;
}

async function lastPrice(db: Db, instrumentId: string): Promise<PricePoint | undefined> {
  const [row] = await db
    .select({ date: schema.price.date, closeMinor: schema.price.closeMinor })
    .from(schema.price)
    .where(eq(schema.price.instrumentId, instrumentId))
    .orderBy(desc(schema.price.date))
    .limit(1);
  return row;
}

async function priceBefore(
  db: Db,
  instrumentId: string,
  date: string,
): Promise<PricePoint | undefined> {
  const [row] = await db
    .select({ date: schema.price.date, closeMinor: schema.price.closeMinor })
    .from(schema.price)
    .where(and(eq(schema.price.instrumentId, instrumentId), sql`${schema.price.date} < ${date}`))
    .orderBy(desc(schema.price.date))
    .limit(1);
  return row;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export { fetchYahooDaily } from "./yahoo";
