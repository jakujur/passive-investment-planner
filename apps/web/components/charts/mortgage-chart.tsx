"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartContainer } from "@/components/ui/chart";
import { formatMonthShort } from "@/lib/mortgage";
import { ChartTooltipFrame, formatAxisPln, TooltipRow, toPlotValue } from "./chart-utils";

export interface BalancePoint {
  /** `YYYY-MM` */
  month: string;
  balanceMinor: bigint;
  projected: boolean;
}

const axisFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit" });

/** Mortgage balance by month: booked history as a solid line, the projected schedule dashed. */
export function MortgageChart({ balance }: { balance: BalancePoint[] }) {
  const { rows, byMonth } = useMemo(() => {
    const byMonth = new Map(balance.map((p) => [p.month, p]));
    const lastHistory = [...balance].reverse().find((p) => !p.projected) ?? null;
    const rows = balance.map((p) => ({
      month: p.month,
      history: p.projected ? null : toPlotValue(p.balanceMinor),
      // The projection starts from the last booked point so the two lines join.
      projected: p.projected || p === lastHistory ? toPlotValue(p.balanceMinor) : null,
    }));
    return { rows, byMonth };
  }, [balance]);

  return (
    <ChartContainer
      config={{
        history: { label: "Saldo", color: "var(--class-real-estate)" },
        projected: { label: "Prognoza", color: "var(--class-real-estate)" },
      }}
      className="aspect-[16/5] min-h-40 w-full"
    >
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} strokeDasharray="2 4" />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          minTickGap={48}
          tickFormatter={(month: string) => axisFormatter.format(new Date(`${month}-01T00:00:00`))}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={84}
          tickFormatter={formatAxisPln}
          domain={[0, "auto"]}
        />
        <Tooltip
          cursor={{ stroke: "var(--border)" }}
          content={({ active, label }) => {
            const point = typeof label === "string" ? byMonth.get(label) : undefined;
            if (!active || !point) return null;
            return (
              <ChartTooltipFrame
                title={`${formatMonthShort(point.month)}${point.projected ? " · prognoza" : ""}`}
                rows={
                  <TooltipRow
                    swatchClass="bg-class-real-estate"
                    label="Saldo"
                    minor={point.balanceMinor}
                  />
                }
              />
            );
          }}
        />
        <Line
          type="monotone"
          dataKey="history"
          stroke="var(--color-history)"
          strokeWidth={2}
          dot={rows.filter((r) => r.history !== null).length === 1}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="projected"
          stroke="var(--color-projected)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          dot={false}
          connectNulls={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
