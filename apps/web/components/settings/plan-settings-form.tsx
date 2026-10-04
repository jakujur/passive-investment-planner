"use client";

import type { RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Stat } from "@/components/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import {
  bpToInput,
  formatPln,
  MONEY_FORMAT_HINT,
  moneyToInput,
  readMoney,
  readPercentBp,
} from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type Settings = RouterOutputs["settings"]["get"];

interface Draft {
  contribution: string;
  expenses: string;
  cushionMonths: string;
  cushionShare: string;
  alertMonths: string;
  etfRounding: Settings["etfRounding"];
  accountFill: Settings["accountFill"];
}
type Errors = Partial<Record<keyof Draft, string>>;

function intIn(raw: string, min: number, max: number): number | null {
  if (!/^\d{1,3}$/.test(raw.trim())) return null;
  const value = Number(raw);
  return value >= min && value <= max ? value : null;
}

export function PlanSettingsForm({ settings }: { settings: Settings }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    contribution: moneyToInput(settings.monthlyContributionMinor),
    expenses: moneyToInput(settings.monthlyExpensesMinor),
    cushionMonths: String(settings.cushionMonths),
    cushionShare: bpToInput(settings.cushionSurplusShareBp),
    alertMonths: String(settings.alertMonthsThreshold),
    etfRounding: settings.etfRounding,
    accountFill: settings.accountFill,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saved, setSaved] = useState(false);
  const update = useMutation(
    trpc.settings.update.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    }),
  );
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setSaved(false);
    setDraft((d) => ({ ...d, [key]: value }));
  };

  const expenses = readMoney(draft.expenses);
  const months = intIn(draft.cushionMonths, 0, 36);
  const cushionTarget =
    expenses !== null && expenses >= 0n && months !== null ? expenses * BigInt(months) : null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: Errors = {};
    const contribution = readMoney(draft.contribution);
    if (contribution === null || contribution < 0n) next.contribution = MONEY_FORMAT_HINT;
    if (expenses === null || expenses < 0n) next.expenses = MONEY_FORMAT_HINT;
    if (months === null) next.cushionMonths = "Od 0 do 36 miesięcy.";
    const share = readPercentBp(draft.cushionShare);
    if (share === null || share < 0 || share > 10_000) next.cushionShare = "Od 0 do 100%.";
    const alertMonths = intIn(draft.alertMonths, 1, 120);
    if (alertMonths === null) next.alertMonths = "Od 1 do 120 miesięcy.";
    setErrors(next);
    if (
      Object.keys(next).length > 0 ||
      contribution === null ||
      expenses === null ||
      months === null ||
      share === null ||
      alertMonths === null
    ) {
      return;
    }
    update.mutate({
      monthlyContributionMinor: contribution,
      monthlyExpensesMinor: expenses,
      cushionMonths: months,
      cushionSurplusShareBp: share,
      alertMonthsThreshold: alertMonths,
      etfRounding: draft.etfRounding,
      accountFill: draft.accountFill,
    });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Rozkład zakupów na konta</CardTitle>
          <CardDescription>
            Jak część wpłaty przypadająca na klasę trafia na jej konta IKE, IKZE i zwykłe.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            aria-label="Rozkład zakupów na konta"
            value={draft.accountFill}
            onValueChange={(value: unknown) => {
              if (value === "EVEN" || value === "SEQUENTIAL") set("accountFill", value);
            }}
            className="sm:grid-cols-2"
          >
            <FieldLabel htmlFor="s-fill-even">
              <Field orientation="horizontal">
                <RadioGroupItem value="EVEN" id="s-fill-even" />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">
                    Równomiernie na wszystkie konta
                  </span>
                  <FieldDescription>
                    Co miesiąc na każde IKE/IKZE do 1/12 rocznego limitu, nadwyżka na rachunek
                    zwykły.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor="s-fill-seq">
              <Field orientation="horizontal">
                <RadioGroupItem value="SEQUENTIAL" id="s-fill-seq" />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">Po kolei</span>
                  <FieldDescription>
                    Najpierw zapełnia pierwsze konto z kolejki, potem następne.
                  </FieldDescription>
                </FieldContent>
              </Field>
            </FieldLabel>
          </RadioGroup>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Plan miesięczny</CardTitle>
          <CardDescription>Stała wpłata i zasady, według których plan ją rozkłada.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup className="gap-8 sm:grid sm:grid-cols-2">
            <Field data-invalid={errors.contribution ? true : undefined}>
              <FieldLabel htmlFor="s-contribution">Miesięczna wpłata</FieldLabel>
              <MoneyInput
                id="s-contribution"
                value={draft.contribution}
                onChange={(v) => set("contribution", v)}
                aria-invalid={errors.contribution ? true : undefined}
              />
              <FieldDescription>
                Plan liczy się z tej kwoty; w danym miesiącu możesz dopłacić.
              </FieldDescription>
              <FieldError>{errors.contribution}</FieldError>
            </Field>
            <Field data-invalid={errors.alertMonths ? true : undefined}>
              <FieldLabel htmlFor="s-alert">Próg ostrzeżenia</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="s-alert"
                  inputMode="numeric"
                  value={draft.alertMonths}
                  onChange={(e) => set("alertMonths", e.target.value)}
                  aria-invalid={errors.alertMonths ? true : undefined}
                  className="tabular-nums"
                />
                <InputGroupAddon align="inline-end">mies.</InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Ostrzegaj, gdy powrót klasy do tolerancji samymi wpłatami potrwa dłużej.
              </FieldDescription>
              <FieldError>{errors.alertMonths}</FieldError>
            </Field>
            <Field className="sm:col-span-2">
              <FieldLabel>Zaokrąglanie ETF</FieldLabel>
              <RadioGroup
                aria-label="Zaokrąglanie ETF"
                value={draft.etfRounding}
                onValueChange={(value: unknown) => {
                  if (value === "WHOLE" || value === "FRACTIONAL") set("etfRounding", value);
                }}
                className="sm:grid-cols-2"
              >
                <FieldLabel htmlFor="s-frac">
                  <Field orientation="horizontal">
                    <RadioGroupItem value="FRACTIONAL" id="s-frac" />
                    <FieldContent>
                      <span className="text-sm font-normal normal-case tracking-normal">
                        Ułamkowe jednostki
                      </span>
                      <FieldDescription>
                        Broker pozwala kupić np. 2,37 jednostki — cała kwota idzie w ETF.
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="s-whole">
                  <Field orientation="horizontal">
                    <RadioGroupItem value="WHOLE" id="s-whole" />
                    <FieldContent>
                      <span className="text-sm font-normal normal-case tracking-normal">
                        Całe jednostki
                      </span>
                      <FieldDescription>Reszta przechodzi na kolejny miesiąc.</FieldDescription>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Poduszka</CardTitle>
          <CardDescription>
            Rezerwa na wydatki, dopełniana zanim pieniądze trafią do portfela.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-8 sm:grid-cols-2">
            <Field data-invalid={errors.expenses ? true : undefined}>
              <FieldLabel htmlFor="s-expenses">Miesięczne wydatki</FieldLabel>
              <MoneyInput
                id="s-expenses"
                value={draft.expenses}
                onChange={(v) => set("expenses", v)}
                aria-invalid={errors.expenses ? true : undefined}
              />
              <FieldError>{errors.expenses}</FieldError>
            </Field>
            <Field data-invalid={errors.cushionMonths ? true : undefined}>
              <FieldLabel htmlFor="s-months">Miesiące w poduszce</FieldLabel>
              <Input
                id="s-months"
                type="number"
                inputMode="numeric"
                min={0}
                max={36}
                value={draft.cushionMonths}
                onChange={(e) => set("cushionMonths", e.target.value)}
                aria-invalid={errors.cushionMonths ? true : undefined}
                className="tabular-nums"
              />
              <FieldError>{errors.cushionMonths}</FieldError>
            </Field>
            <Field data-invalid={errors.cushionShare ? true : undefined}>
              <FieldLabel htmlFor="s-share">Udział poduszki w wpłacie</FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="s-share"
                  inputMode="decimal"
                  value={draft.cushionShare}
                  onChange={(e) => set("cushionShare", e.target.value)}
                  aria-invalid={errors.cushionShare ? true : undefined}
                  className="tabular-nums"
                />
                <InputGroupAddon align="inline-end">%</InputGroupAddon>
              </InputGroup>
              <FieldDescription>
                Jaka część wpłaty idzie na poduszkę, dopóki nie osiągnie celu. 100% = najpierw
                poduszka.
              </FieldDescription>
              <FieldError>{errors.cushionShare}</FieldError>
            </Field>
            <div className="flex flex-col justify-start gap-4 border-l border-border pl-6">
              <Stat
                label="Cel poduszki"
                value={cushionTarget !== null ? formatPln(cushionTarget) : "—"}
                tone={cushionTarget !== null ? "default" : "muted"}
                hint="wydatki × miesiące"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {update.isError && (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się zapisać</AlertTitle>
          <AlertDescription>{update.error.message}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={update.isPending}>
          {update.isPending && <Spinner />}
          Zapisz ustawienia
        </Button>
        {saved && !update.isPending && (
          <span role="status" className="text-sm text-primary">
            Zapisano.
          </span>
        )}
      </div>
    </form>
  );
}
