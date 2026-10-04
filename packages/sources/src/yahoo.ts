import type { PricePoint } from "@pip/engine";
import { parseMoney } from "@pip/money";
import { z } from "zod";
import { getJson } from "./http";

// Unofficial endpoint (no free official API for XETRA closes); it may change without notice,
// in which case the app keeps the last stored close and shows its date.
const API = "https://query1.finance.yahoo.com/v8/finance/chart";

const chartResponse = z.object({
  chart: z.object({
    result: z
      .array(
        z.object({
          meta: z.object({
            currency: z.string(),
            gmtoffset: z.number(),
            longName: z.string().optional(),
            shortName: z.string().optional(),
          }),
          timestamp: z.array(z.number()).default([]),
          indicators: z.object({
            quote: z.array(z.object({ close: z.array(z.number().nullable()).default([]) })),
          }),
        }),
      )
      .min(1),
  }),
});

export async function fetchYahooDaily(
  symbol: string,
  from: string,
): Promise<{ currency: string; name: string; points: PricePoint[] }> {
  const period1 = Math.floor(new Date(`${from}T00:00:00Z`).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);
  const json = await getJson(
    `${API}/${encodeURIComponent(symbol)}?period1=${period1}&period2=${period2}&interval=1d`,
  );
  if (json === null) throw new Error(`Yahoo nie zna symbolu ${symbol}`);
  const [result] = chartResponse.parse(json).chart.result;
  if (!result) throw new Error(`Brak danych dla ${symbol}`);
  const closes = result.indicators.quote[0]?.close ?? [];
  const points: PricePoint[] = [];
  result.timestamp.forEach((ts, i) => {
    const close = closes[i];
    if (close === null || close === undefined) return;
    // Timestamps mark the session open; shifting by the exchange offset gives its local date.
    const date = new Date((ts + result.meta.gmtoffset) * 1000).toISOString().slice(0, 10);
    points.push({ date, closeMinor: parseMoney(close.toFixed(2)) });
  });
  return {
    currency: result.meta.currency,
    name: result.meta.longName ?? result.meta.shortName ?? symbol,
    points,
  };
}
