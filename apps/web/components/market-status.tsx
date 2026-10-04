import type { RouterOutputs } from "@pip/api";
import { AlertTriangle } from "lucide-react";
import { RefreshMarketButton } from "@/components/refresh-market-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { daysSince, formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const STALE_AFTER_DAYS = 5;

type Status = RouterOutputs["market"]["status"];

/** Instruments that never had a quote (retail bonds) are not stale, just unquoted. */
export function marketIsStale(status: Status): boolean {
  const dates = [...status.prices.map((p) => p.lastDate), ...status.fx.map((f) => f.lastDate)];
  return dates.some((date) => {
    const age = daysSince(date);
    return age !== null && age > STALE_AFTER_DAYS;
  });
}

function Row({ label, lastDate }: { label: string; lastDate: string | null }) {
  const age = daysSince(lastDate);
  const stale = age !== null && age > STALE_AFTER_DAYS;
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="min-w-0 truncate">{label}</span>
      <span
        className={cn("shrink-0 tabular-nums", stale ? "text-warning" : "text-muted-foreground")}
      >
        {lastDate ? formatIsoDate(lastDate) : "bez notowań"}
      </span>
    </li>
  );
}

export function MarketStatusCard({ status }: { status: Status }) {
  const stale = marketIsStale(status);
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Notowania</CardTitle>
        <CardDescription>
          Ostatni dzień w bazie dla każdego instrumentu i kursu NBP.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {stale && (
          <Alert variant="warning">
            <AlertTriangle />
            <AlertTitle>Dane starsze niż {STALE_AFTER_DAYS} dni</AlertTitle>
            <AlertDescription>
              Wyceny i plan liczą się z ostatnich dostępnych kursów.
            </AlertDescription>
          </Alert>
        )}
        <ul>
          {status.prices.map((p) => (
            <Row key={p.instrumentId} label={p.name} lastDate={p.lastDate} />
          ))}
          {status.fx.map((f) => (
            <Row key={f.currency} label={`NBP ${f.currency}`} lastDate={f.lastDate} />
          ))}
        </ul>
        <RefreshMarketButton />
      </CardContent>
    </Card>
  );
}
