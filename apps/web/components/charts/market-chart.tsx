"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ClassMeta } from "@/lib/classes";
import { formatAxisMonth, formatIsoDate, formatPln } from "@/lib/format";
import { ChartTooltipFrame, formatAxisPln, TooltipRow, toPlotValue } from "./chart-utils";

export interface PricePoint {
  date: string;
  priceMinor: bigint;
}

const RANGES = [
  { id: "1R", label: "1R", years: 1 },
  { id: "5L", label: "5L", years: 5 },
  { id: "MAX", label: "Max", years: null },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

function cutoff(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

export function MarketChart({
  market,
  lastQuote,
  meta,
  unitLabel,
}: {
  market: PricePoint[];
  lastQuote: PricePoint | null;
  meta: ClassMeta;
  unitLabel: string;
}) {
  const [range, setRange] = useState<RangeId>("5L");
  const { rows, byDate } = useMemo(() => {
    const years = RANGES.find((r) => r.id === range)?.years ?? null;
    const from = years === null ? "" : cutoff(years);
    const visible = market.filter((p) => p.date >= from);
    return {
      rows: visible.map((p) => ({ date: p.date, price: toPlotValue(p.priceMinor) })),
      byDate: new Map(visible.map((p) => [p.date, p])),
    };
  }, [market, range]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {lastQuote ? (
            <>
              Ostatnie notowanie {formatIsoDate(lastQuote.date)}:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatPln(lastQuote.priceMinor)}
              </span>{" "}
              {unitLabel}
            </>
          ) : (
            "Brak notowań — odśwież dane rynkowe."
          )}
        </p>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="Zakres wykresu"
          value={[range]}
          onValueChange={(value) => {
            const next = RANGES.find((r) => value.includes(r.id) && r.id !== range);
            if (next) setRange(next.id);
          }}
        >
          {RANGES.map((r) => (
            <ToggleGroupItem key={r.id} value={r.id} aria-label={`Zakres ${r.label}`}>
              {r.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {rows.length === 0 ? (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          Brak notowań w tym zakresie.
        </p>
      ) : (
        <ChartContainer
          config={{ price: { label: "Cena", color: meta.colorVar } }}
          className="aspect-[16/7] min-h-56 w-full"
        >
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="2 4" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              minTickGap={48}
              tickFormatter={formatAxisMonth}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={72}
              tickFormatter={formatAxisPln}
              domain={["auto", "auto"]}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              content={({ active, label }) => {
                const point = typeof label === "string" ? byDate.get(label) : undefined;
                if (!active || !point) return null;
                return (
                  <ChartTooltipFrame
                    title={formatIsoDate(point.date)}
                    rows={
                      <TooltipRow swatchClass={meta.bg} label="Cena" minor={point.priceMinor} />
                    }
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="var(--color-price)"
              fill="var(--color-price)"
              fillOpacity={0.12}
              strokeWidth={2}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </div>
  );
}
