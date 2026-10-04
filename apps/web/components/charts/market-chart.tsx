"use client";

import { useQuery } from "@tanstack/react-query";
import { GitCompareArrows, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SymbolSearch } from "@/components/symbol-search";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ClassMeta } from "@/lib/classes";
import { formatAxisMonth, formatIsoDate, formatPln, formatQuantity } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ChartTooltipFrame, formatAxisPln, TooltipRow, toPlotValue } from "./chart-utils";

export interface PricePoint {
  date: string;
  priceMinor: bigint;
}

export interface PurchaseMark {
  date: string;
  quantity: string;
  unitPriceMinor: bigint;
  accountName: string;
}

const RANGES = [
  { id: "1R", label: "1R", years: 1 },
  { id: "5L", label: "5L", years: 5 },
  { id: "MAX", label: "Max", years: null },
] as const;
type RangeId = (typeof RANGES)[number]["id"];

const percentFormatter = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

function cutoff(years: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
}

function toEpoch(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromEpoch(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

/** Percent change of `minor` from `base`; chart geometry only. */
function percentFrom(minor: bigint, base: bigint): number {
  return base === 0n ? 0 : (Number(minor) / Number(base) - 1) * 100;
}

interface Row {
  t: number;
  price: number | null;
  cmp: number | null;
}

interface MarkLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function MarketChart({
  market,
  lastQuote,
  meta,
  unitLabel,
  quantityUnit,
  purchaseMarks,
}: {
  market: PricePoint[];
  lastQuote: PricePoint | null;
  meta: ClassMeta;
  unitLabel: string;
  quantityUnit: string;
  purchaseMarks: PurchaseMark[];
}) {
  const trpc = useTRPC();
  const [range, setRange] = useState<RangeId>("5L");
  const [compare, setCompare] = useState<{ symbol: string; name: string } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeMark, setActiveMark] = useState<{ index: number; y: number } | null>(null);
  const compareQuery = useQuery(
    trpc.market.compare.queryOptions(
      { symbol: compare?.symbol ?? "-" },
      { enabled: compare !== null, staleTime: 60 * 60_000 },
    ),
  );
  const comparePoints = compare ? (compareQuery.data?.points ?? null) : null;
  const comparing = comparePoints !== null;

  const { rows, byT, marks, marksByT } = useMemo(() => {
    const years = RANGES.find((r) => r.id === range)?.years ?? null;
    const from = years === null ? "" : cutoff(years);
    const visible = market.filter((p) => p.date >= from);
    const visibleCompare = comparePoints?.filter((p) => p.date >= from) ?? [];
    const priceBase = visible[0]?.priceMinor ?? 0n;
    const compareBase = visibleCompare[0]?.closeMinor ?? 0n;
    const merged = new Map<number, Row>();
    const rowAt = (t: number) => {
      const row = merged.get(t) ?? { t, price: null, cmp: null };
      merged.set(t, row);
      return row;
    };
    for (const p of visible) {
      rowAt(toEpoch(p.date)).price = comparing
        ? percentFrom(p.priceMinor, priceBase)
        : toPlotValue(p.priceMinor);
    }
    for (const p of visibleCompare) {
      rowAt(toEpoch(p.date)).cmp = percentFrom(p.closeMinor, compareBase);
    }
    const rows = [...merged.values()].sort((a, b) => a.t - b.t);
    const byT = new Map(visible.map((p) => [toEpoch(p.date), p]));
    const firstT = rows[0]?.t ?? Number.POSITIVE_INFINITY;
    const marks = purchaseMarks.map((mark, index) => {
      const t = toEpoch(mark.date);
      return {
        ...mark,
        index,
        t,
        y: comparing
          ? percentFrom(mark.unitPriceMinor, priceBase)
          : toPlotValue(mark.unitPriceMinor),
        inRange: t >= firstT,
      };
    });
    const marksByT = new Map<number, typeof marks>();
    for (const mark of marks) {
      const list = marksByT.get(mark.t) ?? [];
      list.push(mark);
      marksByT.set(mark.t, list);
    }
    return { rows, byT, marks, marksByT };
  }, [market, range, comparePoints, comparing, purchaseMarks]);

  const active = activeMark === null ? null : (marks[activeMark.index] ?? null);
  const formatY = comparing ? (tick: number) => `${percentFormatter.format(tick)}%` : formatAxisPln;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="text-sm text-muted-foreground">
          {lastQuote ? (
            <>
              {formatIsoDate(lastQuote.date)}:{" "}
              <span className="font-medium text-foreground tabular-nums">
                {formatPln(lastQuote.priceMinor)}
              </span>{" "}
              {unitLabel}
            </>
          ) : (
            "Brak notowań."
          )}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {compare ? (
            <Badge
              variant="secondary"
              className="h-7 gap-1.5 pr-1 text-xs normal-case tracking-normal"
            >
              <span aria-hidden className="size-2 bg-class-cushion" />
              vs {compare.name}
              {compareQuery.isFetching && <Spinner className="size-3" />}
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Usuń porównanie z ${compare.name}`}
                onClick={() => setCompare(null)}
                className="size-5"
              >
                <X />
              </Button>
            </Badge>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              aria-expanded={searchOpen}
              aria-controls="compare-search"
              onClick={() => setSearchOpen((o) => !o)}
            >
              <GitCompareArrows data-icon="inline-start" />
              Porównaj z…
            </Button>
          )}
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
      </div>

      {searchOpen && !compare && (
        <div id="compare-search" className="border-t border-border pt-3">
          <SymbolSearch
            id="compare-symbol"
            label="Porównaj z"
            description="Obie linie pokazują zmianę w % od początku wybranego zakresu."
            placeholder="np. VWCE, S&P 500, MSCI World"
            size="sm"
            pending={false}
            onSelect={(hit) => {
              setCompare({ symbol: hit.symbol, name: hit.name });
              setSearchOpen(false);
            }}
          />
        </div>
      )}
      {compare && compareQuery.isError && (
        <p role="alert" className="text-sm text-destructive">
          {compareQuery.error.message}
        </p>
      )}

      {rows.length === 0 ? (
        <p className="border-t border-border pt-4 text-sm text-muted-foreground">
          Brak notowań w tym zakresie.
        </p>
      ) : (
        <div className="relative">
          <ChartContainer
            config={{
              price: { label: "Cena", color: meta.colorVar },
              cmp: { label: compare?.name ?? "Porównanie", color: "var(--class-cushion)" },
            }}
            className="aspect-[16/7] min-h-56 w-full"
          >
            <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              <XAxis
                dataKey="t"
                type="number"
                scale="time"
                domain={["dataMin", "dataMax"]}
                tickLine={false}
                axisLine={false}
                minTickGap={48}
                tickFormatter={(t: number) => formatAxisMonth(fromEpoch(t))}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={formatY}
                domain={["auto", "auto"]}
              />
              <Tooltip
                cursor={{ stroke: "var(--border)" }}
                content={({ active: hovering, label }) => {
                  if (!hovering || typeof label !== "number") return null;
                  const point = byT.get(label);
                  const row = rows.find((r) => r.t === label);
                  const bought = marksByT.get(label) ?? [];
                  if (!point && !row) return null;
                  return (
                    <ChartTooltipFrame
                      title={formatIsoDate(fromEpoch(label))}
                      rows={
                        <>
                          {point && (
                            <TooltipRow
                              swatchClass={meta.bg}
                              label="Cena"
                              minor={point.priceMinor}
                            />
                          )}
                          {comparing && row && (
                            <PercentRows
                              price={row.price}
                              cmp={row.cmp}
                              priceSwatch={meta.bg}
                              cmpLabel={compare?.name ?? "Porównanie"}
                            />
                          )}
                          {bought.map((mark) => (
                            <div key={mark.index} className="flex items-center gap-2">
                              <span
                                aria-hidden
                                className="size-2 shrink-0 border border-foreground"
                              />
                              <dt className="flex-1 text-muted-foreground">
                                Zakup {formatQuantity(mark.quantity)} {quantityUnit}
                              </dt>
                              <dd className="font-medium tabular-nums">
                                {formatPln(mark.unitPriceMinor)}
                              </dd>
                            </div>
                          ))}
                        </>
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
                fillOpacity={comparing ? 0 : 0.12}
                strokeWidth={2}
                connectNulls
                isAnimationActive={false}
              />
              {comparing && (
                <Line
                  type="monotone"
                  dataKey="cmp"
                  stroke="var(--color-cmp)"
                  strokeWidth={1.5}
                  dot={false}
                  connectNulls
                  isAnimationActive={false}
                />
              )}
              {marks.map((mark) => (
                <ReferenceLine
                  key={`line-${mark.index}`}
                  y={mark.y}
                  ifOverflow="extendDomain"
                  shape={(props: MarkLineProps) => (
                    <g>
                      <line
                        x1={props.x1}
                        y1={props.y1}
                        x2={props.x2}
                        y2={props.y2}
                        stroke={meta.colorVar}
                        strokeOpacity={activeMark?.index === mark.index ? 1 : 0.55}
                        strokeWidth={1}
                        strokeDasharray="4 3"
                      />
                      <line
                        aria-label={`Zakup ${formatIsoDate(mark.date)}: ${formatQuantity(mark.quantity)} ${quantityUnit} po ${formatPln(mark.unitPriceMinor)}`}
                        x1={props.x1}
                        y1={props.y1}
                        x2={props.x2}
                        y2={props.y2}
                        stroke="transparent"
                        strokeWidth={10}
                        style={{ cursor: "help" }}
                        onPointerEnter={() => setActiveMark({ index: mark.index, y: props.y1 })}
                        onPointerLeave={() => setActiveMark(null)}
                      />
                    </g>
                  )}
                />
              ))}
              {marks
                .filter((mark) => mark.inRange)
                .map((mark) => (
                  <ReferenceDot
                    key={`dot-${mark.index}`}
                    x={mark.t}
                    y={mark.y}
                    r={3.5}
                    fill="var(--card)"
                    stroke={meta.colorVar}
                    strokeWidth={1.5}
                    ifOverflow="extendDomain"
                    onMouseEnter={(dot) => setActiveMark({ index: mark.index, y: dot.cy ?? 0 })}
                    onMouseLeave={() => setActiveMark(null)}
                  />
                ))}
            </ComposedChart>
          </ChartContainer>
          {active && activeMark && (
            <div
              role="status"
              className="pointer-events-none absolute right-2 -translate-y-full"
              style={{ top: Math.max(0, activeMark.y - 6) }}
            >
              <ChartTooltipFrame
                title={`Zakup ${formatIsoDate(active.date)}`}
                rows={
                  <>
                    <div className="flex items-center gap-2">
                      <dt className="flex-1 text-muted-foreground">Cena</dt>
                      <dd className="font-medium tabular-nums">
                        {formatPln(active.unitPriceMinor)}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="flex-1 text-muted-foreground">Ilość</dt>
                      <dd className="font-medium tabular-nums">
                        {formatQuantity(active.quantity)} {quantityUnit}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="flex-1 text-muted-foreground">Konto</dt>
                      <dd className="truncate font-medium">{active.accountName}</dd>
                    </div>
                  </>
                }
              />
            </div>
          )}
        </div>
      )}
      {purchaseMarks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Przerywane linie to ceny Twoich zakupów; najedź, by zobaczyć datę i ilość.
        </p>
      )}
    </div>
  );
}

function PercentRows({
  price,
  cmp,
  priceSwatch,
  cmpLabel,
}: {
  price: number | null;
  cmp: number | null;
  priceSwatch: string;
  cmpLabel: string;
}) {
  return (
    <>
      {price !== null && (
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("size-2 shrink-0", priceSwatch)} />
          <dt className="flex-1 text-muted-foreground">Zmiana</dt>
          <dd className="font-medium tabular-nums">{percentFormatter.format(price)}%</dd>
        </div>
      )}
      {cmp !== null && (
        <div className="flex items-center gap-2">
          <span aria-hidden className="size-2 shrink-0 bg-class-cushion" />
          <dt className="flex-1 truncate text-muted-foreground">{cmpLabel}</dt>
          <dd className="font-medium tabular-nums">{percentFormatter.format(cmp)}%</dd>
        </div>
      )}
    </>
  );
}
