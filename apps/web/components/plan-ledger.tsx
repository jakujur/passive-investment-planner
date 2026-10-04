import type { RouterOutputs } from "@pip/api";
import { formatMoney, money } from "@pip/money";
import { AlertTriangle, ChevronRight, CircleAlert } from "lucide-react";
import { formatBand, formatBp, formatQuantity, SEGMENT_BG, type SegmentTone } from "@/lib/format";
import { cn } from "@/lib/utils";

type Preview = Pick<RouterOutputs["plan"]["current"], "plan" | "labels">;
type Plan = Preview["plan"];
export type PlanLabels = Preview["labels"];
type Item = Plan["items"][number];
type AlertModel = Plan["alerts"][number];

export interface LedgerRow {
  key: string;
  tone: SegmentTone;
  kind: string;
  account: string;
  detail: string | null;
  amount: string;
  amountInBase: string | null;
}

export function showsPerson(labels: PlanLabels): boolean {
  return new Set(Object.values(labels.accounts).map((a) => a.personName)).size > 1;
}

/** How one plan line reads in a ledger: class tone, kind, account line, what was bought and the amount. */
export function describeItem(
  item: Item,
  index: number,
  labels: PlanLabels,
  showPerson: boolean,
): LedgerRow {
  const describeAccount = (accountId: string) => {
    const account = labels.accounts[accountId];
    const parts = [account.name, account.broker];
    if (showPerson) parts.push(account.personName);
    return parts.join(" · ");
  };
  const key = `${item.kind}-${index}`;

  switch (item.kind) {
    case "CUSHION":
      return {
        key,
        tone: "CUSHION",
        kind: "Poduszka",
        account: describeAccount(item.accountId),
        detail: null,
        amount: formatMoney(money(item.amountMinor)),
        amountInBase: null,
      };
    case "GOAL":
      return {
        key,
        tone: "REAL_ESTATE",
        kind: `Cel: ${labels.goals[item.goalId].name}`,
        account: describeAccount(item.accountId),
        detail: null,
        amount: formatMoney(money(item.amountMinor)),
        amountInBase: null,
      };
    case "OVERPAYMENT":
      return {
        key,
        tone: "REAL_ESTATE",
        kind: "Nadpłata",
        account: `Kredyt: ${labels.mortgages[item.mortgageId].propertyName}`,
        detail: null,
        amount: formatMoney(money(item.amountMinor)),
        amountInBase: null,
      };
    case "BUY": {
      const instrument = labels.instruments[item.instrumentId];
      const name = instrument.ticker ?? instrument.name;
      const cls = labels.classes[item.classId];
      return {
        key,
        tone: cls.kind,
        kind: cls.name,
        account: describeAccount(item.accountId),
        detail: item.quantity
          ? `${formatQuantity(item.quantity)} ${instrument.type === "GOLD" ? "g" : "szt."} ${name}`
          : `${name} za kwotę przelewu`,
        amount: formatMoney(money(item.accountAmountMinor, item.currency)),
        amountInBase: item.currency === "PLN" ? null : `≈ ${formatMoney(money(item.amountMinor))}`,
      };
    }
  }
}

function alertCopy(alert: AlertModel, labels: PlanLabels) {
  const className = labels.classes[alert.classId].name;
  switch (alert.type) {
    case "OUT_OF_BAND":
      return {
        severe: false,
        text: `${className} poza tolerancją: ${formatBp(alert.weightBp)} przy ${formatBand(alert.band)}; ${
          alert.monthsToReturn === null
            ? "nie wróci bez innych wpłat."
            : `powrót samymi wpłatami zajmie ok. ${alert.monthsToReturn} mies.`
        }`,
      };
    case "REAL_ESTATE_CONCENTRATION":
      return {
        severe: false,
        text: `Koncentracja: ${className.toLocaleLowerCase("pl-PL")} to ${formatBp(alert.weightBp)} majątku przy tolerancji ${formatBand(alert.band)}.`,
      };
    case "NO_ACCOUNT_CAPACITY":
      return {
        severe: true,
        text: `Brak miejsca na kontach ${className.toLocaleLowerCase("pl-PL")}: nie udało się ulokować ${formatMoney(money(alert.unplacedMinor))}.`,
      };
  }
}

function rationaleTone(subject: string, labels: PlanLabels): SegmentTone {
  if (subject === "CUSHION") return "CUSHION";
  if (subject === "REAL_ESTATE") return "REAL_ESTATE";
  return labels.classes[subject].kind;
}

/** Compact ledger of a month's transfers: one hairline row per transfer, alerts and rationale below. */
export function PlanLedger({
  plan,
  labels,
  rationale = true,
  className,
}: Preview & {
  rationale?: boolean;
  className?: string;
}) {
  const showPerson = showsPerson(labels);
  const rows = plan.items.map((item, index) => describeItem(item, index, labels, showPerson));

  return (
    <div className={cn("@container flex flex-col gap-3", className)}>
      {rows.length === 0 ? (
        <p className="border-t border-border pt-3 text-sm text-muted-foreground">
          Brak przelewów w tym miesiącu.
        </p>
      ) : (
        <ol className="border-t border-border">
          {rows.map((row) => (
            <li
              key={row.key}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 border-b border-border py-2 @xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_auto]"
            >
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 self-center", SEGMENT_BG[row.tone])}
                />
                <span className="shrink-0 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  {row.kind}
                </span>
                <span className="min-w-0 text-sm font-medium">{row.account}</span>
              </div>
              <span className="row-start-2 pl-4 text-sm text-muted-foreground tabular-nums @xl:row-start-auto @xl:pl-0">
                {row.detail}
              </span>
              <span className="col-start-2 row-start-1 flex flex-col items-end text-sm tabular-nums @xl:col-start-3">
                <span className="font-medium">{row.amount}</span>
                {row.amountInBase && (
                  <span className="text-xs text-muted-foreground">{row.amountInBase}</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {plan.carryOutMinor > 0n && (
        <p className="flex justify-between gap-4 text-sm">
          <span className="text-muted-foreground">Przechodzi na kolejny miesiąc</span>
          <span className="font-medium tabular-nums">{formatMoney(money(plan.carryOutMinor))}</span>
        </p>
      )}

      {plan.alerts.length > 0 && (
        <ul className="flex flex-col gap-1">
          {plan.alerts.map((alert) => {
            const copy = alertCopy(alert, labels);
            return (
              <li
                key={`${alert.type}-${alert.classId}`}
                className={cn(
                  "flex items-start gap-2 text-sm",
                  copy.severe ? "text-destructive" : "text-warning",
                )}
              >
                {copy.severe ? (
                  <CircleAlert className="mt-0.5 size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                )}
                <span>{copy.text}</span>
              </li>
            );
          })}
        </ul>
      )}

      {rationale && plan.rationale.length > 0 && (
        <details className="group text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 transition-transform group-open:rotate-90" />
            Dlaczego tak ({plan.rationale.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1 pl-5">
            {plan.rationale.map((entry) => (
              <li key={`${entry.subject}-${entry.text}`} className="flex items-baseline gap-2">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2 shrink-0 self-start",
                    SEGMENT_BG[rationaleTone(entry.subject, labels)],
                  )}
                />
                <span className="text-muted-foreground">{entry.text}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
