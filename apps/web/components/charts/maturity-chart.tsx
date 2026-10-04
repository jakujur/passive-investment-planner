"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { CLASSES } from "@/lib/classes";
import { ChartTooltipFrame, formatAxisPln, TooltipRow, toPlotValue } from "./chart-utils";

export interface MaturityBucket {
  year: string;
  nominalMinor: bigint;
}

export function MaturityChart({ maturities }: { maturities: MaturityBucket[] }) {
  const meta = CLASSES.BONDS;
  const { rows, byYear } = useMemo(() => {
    if (maturities.length === 0) return { rows: [], byYear: new Map<string, MaturityBucket>() };
    const first = Number(maturities[0]?.year);
    const last = Number(maturities[maturities.length - 1]?.year);
    const byYear = new Map(maturities.map((m) => [m.year, m]));
    const rows: { year: string; nominal: number }[] = [];
    for (let y = first; y <= last; y++) {
      const bucket = byYear.get(String(y));
      rows.push({ year: String(y), nominal: bucket ? toPlotValue(bucket.nominalMinor) : 0 });
    }
    return { rows, byYear };
  }, [maturities]);

  return (
    <ChartContainer
      config={{ nominal: { label: "Wykup", color: meta.colorVar } }}
      className="aspect-[16/6] min-h-48 w-full"
    >
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis dataKey="year" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={72} tickFormatter={formatAxisPln} />
        <Tooltip
          cursor={{ fill: "var(--muted)" }}
          content={({ active, label }) => {
            const bucket = typeof label === "string" ? byYear.get(label) : undefined;
            if (!active || !bucket) return null;
            return (
              <ChartTooltipFrame
                title={`Wykup w ${bucket.year}`}
                rows={
                  <TooltipRow swatchClass={meta.bg} label="Nominał" minor={bucket.nominalMinor} />
                }
              />
            );
          }}
        />
        <Bar dataKey="nominal" fill="var(--color-nominal)" isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
