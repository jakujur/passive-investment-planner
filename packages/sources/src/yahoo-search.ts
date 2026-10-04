import { z } from "zod";
import { getJson } from "./http";

const API = "https://query2.finance.yahoo.com/v1/finance/search";
const ALLOWED_QUOTE_TYPES = new Set(["ETF", "EQUITY", "MUTUALFUND"]);

const searchResponse = z.object({
  quotes: z
    .array(
      z.object({
        symbol: z.string().optional(),
        shortname: z.string().optional(),
        longname: z.string().optional(),
        exchange: z.string().optional(),
        exchDisp: z.string().optional(),
        quoteType: z.string().optional(),
        isYahooFinance: z.boolean().optional(),
      }),
    )
    .default([]),
});

export interface SymbolHit {
  symbol: string;
  name: string;
  exchange: string | null;
  quoteType: string;
}

/** Yahoo symbol search, limited to funds and shares; same filter as the GEM dashboard. */
export async function searchYahooSymbols(query: string): Promise<SymbolHit[]> {
  const q = query.trim();
  if (!q) return [];
  const json = await getJson(
    `${API}?q=${encodeURIComponent(q)}&quotesCount=15&newsCount=0&listsCount=0`,
  );
  if (json === null) return [];
  return searchResponse.parse(json).quotes.flatMap((hit) =>
    hit.symbol && hit.isYahooFinance !== false && ALLOWED_QUOTE_TYPES.has(hit.quoteType ?? "")
      ? [
          {
            symbol: hit.symbol,
            name: hit.longname ?? hit.shortname ?? hit.symbol,
            exchange: hit.exchDisp ?? hit.exchange ?? null,
            quoteType: hit.quoteType ?? "",
          },
        ]
      : [],
  );
}
