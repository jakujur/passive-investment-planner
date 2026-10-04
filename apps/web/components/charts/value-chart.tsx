"use client";

import { useMemo } from "react";
import { Area, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import type { ClassMeta } from "@/lib/classes";
import { formatAxisMonth, formatIsoDate } from "@/lib/format";
import { ChartTooltipFrame, formatAxisPln, TooltipRow, toPlotValue } from "./chart-utils";

export interface ValuePoint {
  date: string;
  contributedMinor: bigint;
  valueMinor: bigint;
}

export function ValueChart({
  series,
  meta,
  valueLabel = "Wartość",
}: {
  series: ValuePoint[];
  meta: ClassMeta;
  valueLabel?: string;
}) {
  const { rows, byDate } = useMemo(() => {
    const byDate = new Map(series.map((p) => [p.date, p]));
    const rows = series.map((p) => ({
      date: p.date,
      contributed: toPlotValue(p.contributedMinor),
      value: toPlotValue(p.valueMinor),
    }));
    return { rows, byDate };
  }, [series]);

  return (
    <ChartContainer
      config={{
        contributed: { label: "Wpłaty", color: "var(--class-cushion)" },
        value: { label: valueLabel, color: meta.colorVar },
      }}
      className="aspect-[16/7] min-h-56 w-full"
    >
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
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
          domain={[0, "auto"]}
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
                  <>
                    <TooltipRow swatchClass={meta.bg} label={valueLabel} minor={point.valueMinor} />
                    <TooltipRow
                      swatchClass="bg-class-cushion"
                      label="Wpłaty"
                      minor={point.contributedMinor}
                    />
                    <TooltipRow
                      swatchClass="bg-transparent"
                      label="Wynik"
                      minor={point.valueMinor - point.contributedMinor}
                    />
                  </>
                }
              />
            );
          }}
        />
        <Area
          type="stepAfter"
          dataKey="contributed"
          stroke="var(--color-contributed)"
          fill="var(--color-contributed)"
          fillOpacity={0.18}
          strokeWidth={1}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2}
          dot={rows.length === 1}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}
