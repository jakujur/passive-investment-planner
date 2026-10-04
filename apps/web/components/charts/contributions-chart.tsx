"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { formatMonth } from "@/lib/format";
import { ChartTooltipFrame, formatAxisPln, TooltipRow, toPlotValue } from "./chart-utils";

export interface MonthPoint {
  /** `YYYY-MM` */
  month: string;
  surplusMinor: bigint;
}

const axisFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit" });

/** Monthly contributions as bars with the running total as a line, oldest month first. */
export function ContributionsChart({ months }: { months: MonthPoint[] }) {
  const { rows, byMonth } = useMemo(() => {
    const ordered = [...months].sort((a, b) => a.month.localeCompare(b.month));
    let cumulative = 0n;
    const byMonth = new Map<string, { surplusMinor: bigint; cumulativeMinor: bigint }>();
    const rows = ordered.map((m) => {
      cumulative += m.surplusMinor;
      byMonth.set(m.month, { surplusMinor: m.surplusMinor, cumulativeMinor: cumulative });
      return {
        month: m.month,
        surplus: toPlotValue(m.surplusMinor),
        cumulative: toPlotValue(cumulative),
      };
    });
    return { rows, byMonth };
  }, [months]);

  return (
    <ChartContainer
      config={{
        surplus: { label: "Wpłata", color: "var(--class-cushion)" },
        cumulative: { label: "Łącznie", color: "var(--primary)" },
      }}
      className="aspect-[16/5] min-h-40 w-full"
    >
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
          tickFormatter={(month: string) => axisFormatter.format(new Date(`${month}-01T00:00:00`))}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={72}
          tickFormatter={formatAxisPln}
          domain={[0, "auto"]}
        />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, label }) => {
            const point = typeof label === "string" ? byMonth.get(label) : undefined;
            if (!active || !point || typeof label !== "string") return null;
            return (
              <ChartTooltipFrame
                title={formatMonth(label)}
                rows={
                  <>
                    <TooltipRow
                      swatchClass="bg-class-cushion"
                      label="Wpłata"
                      minor={point.surplusMinor}
                    />
                    <TooltipRow
                      swatchClass="bg-primary"
                      label="Łącznie"
                      minor={point.cumulativeMinor}
                    />
                  </>
                }
              />
            );
          }}
        />
        <Bar
          dataKey="surplus"
          fill="var(--color-surplus)"
          fillOpacity={0.5}
          maxBarSize={40}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="cumulative"
          stroke="var(--color-cumulative)"
          strokeWidth={2}
          dot={rows.length === 1}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
