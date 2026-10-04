import type { RouterOutputs } from "@pip/api";
import { formatMoney, money } from "@pip/money";
import { AlertTriangle, CircleAlert } from "lucide-react";
import { AllocationStrip, type Segment } from "@/components/allocation-strip";
import { Stat } from "@/components/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatBand, formatBp, SEGMENT_BG, type SegmentTone } from "@/lib/format";
import { cn } from "@/lib/utils";

type Preview = RouterOutputs["plan"]["preview"];
type Plan = Preview["plan"];
type Labels = Preview["labels"];
type Item = Plan["items"][number];
type AlertModel = Plan["alerts"][number];

interface RowModel {
  key: string;
  kind: string;
  account: string;
  detail: string | null;
  amount: string;
  amountInBase: string | null;
}

function toRow(item: Item, index: number, labels: Labels, showPerson: boolean): RowModel {
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
        kind: "Poduszka",
        account: describeAccount(item.accountId),
        detail: null,
        amount: formatMoney(money(item.amountMinor)),
        amountInBase: null,
      };
    case "GOAL":
      return {
        key,
        kind: `Wkład własny: ${labels.goals[item.goalId].name}`,
        account: describeAccount(item.accountId),
        detail: null,
        amount: formatMoney(money(item.amountMinor)),
        amountInBase: null,
      };
    case "OVERPAYMENT":
      return {
        key,
        kind: `Nadpłata kredytu: ${labels.mortgages[item.mortgageId].propertyName}`,
        account: "Rachunek kredytu",
        detail: null,
        amount: formatMoney(money(item.amountMinor)),
        amountInBase: null,
      };
    case "BUY": {
      const instrument = labels.instruments[item.instrumentId];
      const name = instrument.ticker
        ? `${instrument.name} (${instrument.ticker})`
        : instrument.name;
      return {
        key,
        kind: labels.classes[item.classId].name,
        account: describeAccount(item.accountId),
        detail: item.quantity
          ? `Kup ${item.quantity} szt. ${name}`
          : `Kup ${name} za kwotę przelewu`,
        amount: formatMoney(money(item.accountAmountMinor, item.currency)),
        amountInBase: item.currency === "PLN" ? null : `≈ ${formatMoney(money(item.amountMinor))}`,
      };
    }
  }
}

function toSegments(plan: Plan, labels: Labels): Segment[] {
  const byId = new Map<string, Segment>();
  const add = (id: string, label: string, tone: Segment["tone"], amountMinor: bigint) => {
    const existing = byId.get(id);
    if (existing) existing.amountMinor += amountMinor;
    else byId.set(id, { id, label, tone, amountMinor });
  };
  for (const item of plan.items) {
    switch (item.kind) {
      case "CUSHION":
        add("cushion", "Poduszka", "CUSHION", item.amountMinor);
        break;
      case "GOAL":
        add("goal", "Wkład własny", "REAL_ESTATE", item.amountMinor);
        break;
      case "OVERPAYMENT":
        add("overpayment", "Nadpłata kredytu", "REAL_ESTATE", item.amountMinor);
        break;
      case "BUY":
        add(
          item.classId,
          labels.classes[item.classId].name,
          labels.classes[item.classId].kind,
          item.amountMinor,
        );
        break;
    }
  }
  return [...byId.values()];
}

function alertCopy(alert: AlertModel, labels: Labels) {
  const className = labels.classes[alert.classId].name;
  switch (alert.type) {
    case "OUT_OF_BAND":
      return {
        variant: "warning" as const,
        title: `${className} poza pasmem`,
        text: `${className} ma ${formatBp(alert.weightBp)} przy paśmie ${formatBand(alert.band)}; ${
          alert.monthsToReturn === null
            ? "nie wróci bez innych wpłat."
            : `powrót nowymi wpłatami zajmie ok. ${alert.monthsToReturn} mies.`
        }`,
      };
    case "REAL_ESTATE_CONCENTRATION":
      return {
        variant: "warning" as const,
        title: "Koncentracja w nieruchomościach",
        text: `${className} stanowi ${formatBp(alert.weightBp)} majątku przy paśmie ${formatBand(alert.band)}.`,
      };
    case "NO_ACCOUNT_CAPACITY":
      return {
        variant: "destructive" as const,
        title: `Brak miejsca na kontach: ${className}`,
        text: `Nie udało się ulokować ${formatMoney(money(alert.unplacedMinor))} — wszystkie konta w kolejce tej klasy są wypełnione.`,
      };
  }
}

function rationaleTone(subject: string, labels: Labels): SegmentTone {
  if (subject === "CUSHION") return "CUSHION";
  if (subject === "REAL_ESTATE") return "REAL_ESTATE";
  return labels.classes[subject].kind;
}

export function PlanResult({ plan, labels }: Preview) {
  const showPerson = new Set(Object.values(labels.accounts).map((a) => a.personName)).size > 1;
  const rows = plan.items.map((item, index) => toRow(item, index, labels, showPerson));

  return (
    <div className="flex flex-col gap-10 animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="grid gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
        <Stat label="Nadwyżka" value={formatMoney(money(plan.surplusMinor))} tone="hero" />
        <AllocationStrip
          segments={toSegments(plan, labels)}
          emptyCaption="Nic do rozpisania — cała kwota przechodzi na kolejny miesiąc."
        />
      </div>

      {plan.alerts.length > 0 && (
        <ul className="flex flex-col gap-3">
          {plan.alerts.map((alert) => {
            const copy = alertCopy(alert, labels);
            return (
              <li key={`${alert.type}-${alert.classId}`}>
                <Alert variant={copy.variant}>
                  {copy.variant === "destructive" ? <CircleAlert /> : <AlertTriangle />}
                  <AlertTitle>{copy.title}</AlertTitle>
                  <AlertDescription>{copy.text}</AlertDescription>
                </Alert>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="ledger-heading" className="flex flex-col gap-4">
        <h3
          id="ledger-heading"
          className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Przelewy
        </h3>
        {rows.length === 0 ? (
          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            Brak przelewów w tym miesiącu.
          </p>
        ) : (
          <ol className="border-t border-border">
            {rows.map((row) => (
              <li
                key={row.key}
                className="grid gap-x-8 gap-y-1 border-b border-border py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-baseline"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {row.kind}
                  </span>
                  <span className="text-base font-medium">{row.account}</span>
                  {row.detail && (
                    <span className="text-sm text-muted-foreground">{row.detail}</span>
                  )}
                </div>
                <div className="flex flex-col sm:items-end">
                  <span className="font-heading text-2xl tabular-nums">{row.amount}</span>
                  {row.amountInBase && (
                    <span className="text-sm text-muted-foreground tabular-nums">
                      {row.amountInBase}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {plan.carryOutMinor > 0n && (
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 py-2">
            <span className="text-sm text-muted-foreground">
              Do przeniesienia na kolejny miesiąc
            </span>
            <span className="text-base font-medium tabular-nums">
              {formatMoney(money(plan.carryOutMinor))}
            </span>
          </div>
        )}
      </section>

      {plan.rationale.length > 0 && (
        <section aria-labelledby="rationale-heading" className="flex flex-col gap-4">
          <h3
            id="rationale-heading"
            className="text-xs font-semibold tracking-wide text-muted-foreground uppercase"
          >
            Dlaczego tak
          </h3>
          <ul className="flex flex-col gap-3 text-sm">
            {plan.rationale.map((entry) => (
              <li key={`${entry.subject}-${entry.text}`} className="flex items-baseline gap-3">
                <span
                  aria-hidden
                  className={cn(
                    "mt-1.5 size-2.5 shrink-0 self-start",
                    SEGMENT_BG[rationaleTone(entry.subject, labels)],
                  )}
                />
                <span className="text-muted-foreground">{entry.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
