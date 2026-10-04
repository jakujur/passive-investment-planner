import { type Db, schema } from "@pip/db";
import { asOf, type FxPoint, type InstrumentQuotes, type PricePoint } from "@pip/engine";
import { RATE_SCALE, toBase } from "@pip/money";
import { asc, inArray } from "drizzle-orm";

/** Full price and NBP-rate history for the given instruments. */
export async function loadQuotes(
  db: Db,
  instrumentIds: readonly string[],
): Promise<Map<string, InstrumentQuotes>> {
  if (instrumentIds.length === 0) return new Map();
  const instruments = await db
    .select({ id: schema.instrument.id, currency: schema.instrument.currency })
    .from(schema.instrument)
    .where(inArray(schema.instrument.id, [...instrumentIds]));
  const prices = await db
    .select({
      instrumentId: schema.price.instrumentId,
      date: schema.price.date,
      closeMinor: schema.price.closeMinor,
    })
    .from(schema.price)
    .where(inArray(schema.price.instrumentId, [...instrumentIds]))
    .orderBy(asc(schema.price.date));
  const currencies = [...new Set(instruments.map((i) => i.currency))].filter((c) => c !== "PLN");
  const rates = currencies.length
    ? await db
        .select()
        .from(schema.fxRate)
        .where(inArray(schema.fxRate.currency, currencies))
        .orderBy(asc(schema.fxRate.date))
    : [];

  const pricesById = new Map<string, PricePoint[]>();
  for (const p of prices) {
    const list = pricesById.get(p.instrumentId) ?? [];
    list.push({ date: p.date, closeMinor: p.closeMinor });
    pricesById.set(p.instrumentId, list);
  }
  const fxByCurrency = new Map<string, FxPoint[]>();
  for (const r of rates) {
    const list = fxByCurrency.get(r.currency) ?? [];
    list.push({ date: r.date, rate: r.rate });
    fxByCurrency.set(r.currency, list);
  }
  return new Map(
    instruments.map((i) => [
      i.id,
      {
        prices: pricesById.get(i.id) ?? [],
        fx: i.currency === "PLN" ? null : (fxByCurrency.get(i.currency) ?? []),
      },
    ]),
  );
}

/** Close converted to PLN with the NBP rate valid on that day; `null` without a quote or rate. */
export function priceInBaseAt(quotes: InstrumentQuotes | undefined, date: string) {
  const price = quotes && asOf(quotes.prices, date);
  if (!quotes || !price) return null;
  const rate = quotes.fx === null ? RATE_SCALE : asOf(quotes.fx, price.date)?.rate;
  if (rate === undefined) return null;
  return {
    date: price.date,
    closeMinor: price.closeMinor,
    priceMinor: toBase(price.closeMinor, rate),
  };
}

/** Weekly dates from `from` up to and including `to`. */
export function weeklyDates(from: string, to: string): string[] {
  const dates: string[] = [];
  const day = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (day < end) {
    dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 7);
  }
  dates.push(to);
  return dates;
}
