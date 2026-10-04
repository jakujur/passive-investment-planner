import type { FxPoint, PricePoint } from "@pip/engine";
import { parseMoney, parseRate } from "@pip/money";
import { z } from "zod";
import { dateChunks, getJson } from "./http";

const API = "https://api.nbp.pl/api";
/** NBP rejects queries spanning more than 93 days. */
const MAX_RANGE_DAYS = 93;
/** First day of NBP gold quotes. */
export const NBP_GOLD_START = "2013-01-02";

const fxResponse = z.object({
  rates: z.array(z.object({ effectiveDate: z.string(), mid: z.number().positive() })),
});
const goldResponse = z.array(z.object({ data: z.string(), cena: z.number().positive() }));

/** Table A mid rates, PLN per unit of `currency`. */
export async function fetchNbpFx(currency: string, from: string, to: string): Promise<FxPoint[]> {
  const points: FxPoint[] = [];
  for (const [start, end] of dateChunks(from, to, MAX_RANGE_DAYS)) {
    const json = await getJson(
      `${API}/exchangerates/rates/A/${currency}/${start}/${end}/?format=json`,
    );
    if (json === null) continue;
    for (const rate of fxResponse.parse(json).rates) {
      points.push({ date: rate.effectiveDate, rate: parseRate(String(rate.mid)) });
    }
  }
  return points;
}

/** NBP gold price in PLN per gram (1000 fineness). */
export async function fetchNbpGold(from: string, to: string): Promise<PricePoint[]> {
  const points: PricePoint[] = [];
  const start = from < NBP_GOLD_START ? NBP_GOLD_START : from;
  for (const [chunkStart, chunkEnd] of dateChunks(start, to, MAX_RANGE_DAYS)) {
    const json = await getJson(`${API}/cenyzlota/${chunkStart}/${chunkEnd}/?format=json`);
    if (json === null) continue;
    for (const quote of goldResponse.parse(json)) {
      points.push({ date: quote.data, closeMinor: parseMoney(quote.cena.toFixed(2)) });
    }
  }
  return points;
}
