"use client";

import type { RouterInputs, RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  MONEY_FORMAT_HINT,
  moneyToInput,
  readMoney,
  readPercentBp,
  todayIso,
} from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "REAL_ESTATE" }>;
type Property = Overview["properties"][number];
type Goal = Overview["goals"][number];
type PropertyInput = RouterInputs["realEstate"]["upsertProperty"];

interface PropertyDraft {
  name: string;
  usage: "OWN" | "RENTAL";
  value: string;
  valuationDate: string;
  includeInRebalancing: boolean;
  hasMortgage: boolean;
  mortgageBalance: string;
  mortgageRate: string;
  mortgageInstallment: string;
  rent: string;
  costs: string;
  vacancy: string;
}

type PropertyErrors = Partial<Record<keyof PropertyDraft, string>>;

function draftFrom(property: Property | null): PropertyDraft {
  return {
    name: property?.name ?? "",
    usage: property?.usage ?? "OWN",
    value: property ? moneyToInput(property.valueMinor) : "",
    valuationDate: property?.valuationDate ?? todayIso(),
    includeInRebalancing: property?.includeInRebalancing ?? false,
    hasMortgage: property?.mortgage !== null && property?.mortgage !== undefined,
    mortgageBalance: property?.mortgage ? moneyToInput(property.mortgage.balanceMinor) : "",
    mortgageRate: property?.mortgage ? bpToInput(property.mortgage.rateBp) : "",
    mortgageInstallment: property?.mortgage ? moneyToInput(property.mortgage.installmentMinor) : "",
    rent: property?.rental ? moneyToInput(property.rental.rentMinor) : "",
    costs: property?.rental ? moneyToInput(property.rental.costsMinor) : "0",
    vacancy: property?.rental?.vacancyMonthsPerYear ?? "1",
  };
}

function toPropertyInput(
  id: string | null,
  d: PropertyDraft,
): { input: PropertyInput } | { errors: PropertyErrors } {
  const errors: PropertyErrors = {};
  if (!d.name.trim()) errors.name = "Podaj nazwę.";
  const value = readMoney(d.value);
  if (value === null || value < 0n) errors.value = MONEY_FORMAT_HINT;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.valuationDate)) errors.valuationDate = "Podaj datę wyceny.";

  let mortgage: PropertyInput["mortgage"] = null;
  if (d.hasMortgage) {
    const balance = readMoney(d.mortgageBalance);
    const rateBp = readPercentBp(d.mortgageRate);
    const installment = readMoney(d.mortgageInstallment);
    if (balance === null || balance < 0n) errors.mortgageBalance = MONEY_FORMAT_HINT;
    if (rateBp === null || rateBp < 0 || rateBp > 5000)
      errors.mortgageRate = "Podaj oprocentowanie w %, np. 7,5.";
    if (installment === null || installment < 0n) errors.mortgageInstallment = MONEY_FORMAT_HINT;
    if (balance !== null && rateBp !== null && installment !== null) {
      mortgage = { balanceMinor: balance, rateBp, installmentMinor: installment };
    }
  }

  let rental: PropertyInput["rental"] = null;
  if (d.usage === "RENTAL") {
    const rent = readMoney(d.rent);
    const costs = readMoney(d.costs);
    const vacancy = d.vacancy.trim().replace(",", ".");
    if (rent === null || rent < 0n) errors.rent = MONEY_FORMAT_HINT;
    if (costs === null || costs < 0n) errors.costs = MONEY_FORMAT_HINT;
    if (!/^(1[0-2]|\d)(\.\d{1,2})?$/.test(vacancy))
      errors.vacancy = "Od 0 do 12 miesięcy, np. 1 lub 0,5.";
    if (rent !== null && costs !== null) {
      rental = { rentMinor: rent, costsMinor: costs, vacancyMonthsPerYear: vacancy };
    }
  }

  if (Object.keys(errors).length > 0 || value === null) return { errors };
  return {
    input: {
      id,
      name: d.name.trim(),
      usage: d.usage,
      valueMinor: value,
      valuationDate: d.valuationDate,
      includeInRebalancing: d.includeInRebalancing,
      mortgage,
      rental,
    },
  };
}

export function PropertyDialog({ property }: { property: Property | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PropertyDraft>(() => draftFrom(property));
  const [errors, setErrors] = useState<PropertyErrors>({});
  const upsert = useMutation(
    trpc.realEstate.upsertProperty.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const prefix = property ? `prop-${property.id}` : "prop-new";
  const set = <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(draftFrom(property));
      setErrors({});
      upsert.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = toPropertyInput(property?.id ?? null, draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    upsert.mutate(result.input);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={property ? <Button variant="outline" size="xs" /> : <Button size="sm" />}
      >
        {property ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {property ? "Edytuj" : "Dodaj mieszkanie"}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{property ? "Edycja mieszkania" : "Nowe mieszkanie"}</DialogTitle>
            <DialogDescription>
              Wartość i zadłużenie liczą się do majątku; czynsz najmu daje rentowność netto.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-6">
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor={`${prefix}-name`}>Nazwa</FieldLabel>
              <Input
                id={`${prefix}-name`}
                value={draft.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="np. Kawalerka na Pradze"
                aria-invalid={errors.name ? true : undefined}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <Field>
              <FieldLabel>Przeznaczenie</FieldLabel>
              <RadioGroup
                aria-label="Przeznaczenie"
                value={draft.usage}
                onValueChange={(value: unknown) => {
                  if (value === "OWN" || value === "RENTAL") set("usage", value);
                }}
                className="grid-cols-2"
              >
                <FieldLabel htmlFor={`${prefix}-own`}>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="OWN" id={`${prefix}-own`} />
                    <FieldContent>
                      <span className="text-sm font-normal normal-case tracking-normal">
                        Własne
                      </span>
                    </FieldContent>
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor={`${prefix}-rental`}>
                  <Field orientation="horizontal">
                    <RadioGroupItem value="RENTAL" id={`${prefix}-rental`} />
                    <FieldContent>
                      <span className="text-sm font-normal normal-case tracking-normal">
                        Wynajem
                      </span>
                    </FieldContent>
                  </Field>
                </FieldLabel>
              </RadioGroup>
            </Field>
            <div className="grid gap-6 sm:grid-cols-2">
              <Field data-invalid={errors.value ? true : undefined}>
                <FieldLabel htmlFor={`${prefix}-value`}>Wartość</FieldLabel>
                <MoneyInput
                  id={`${prefix}-value`}
                  value={draft.value}
                  onChange={(v) => set("value", v)}
                  aria-invalid={errors.value ? true : undefined}
                />
                <FieldError>{errors.value}</FieldError>
              </Field>
              <Field data-invalid={errors.valuationDate ? true : undefined}>
                <FieldLabel htmlFor={`${prefix}-date`}>Data wyceny</FieldLabel>
                <Input
                  id={`${prefix}-date`}
                  type="date"
                  max={todayIso()}
                  value={draft.valuationDate}
                  onChange={(e) => set("valuationDate", e.target.value)}
                  aria-invalid={errors.valuationDate ? true : undefined}
                  className="tabular-nums"
                />
                <FieldError>{errors.valuationDate}</FieldError>
              </Field>
            </div>
            <Field orientation="horizontal">
              <Checkbox
                id={`${prefix}-include`}
                checked={draft.includeInRebalancing}
                onCheckedChange={(checked) => set("includeInRebalancing", checked)}
              />
              <FieldContent>
                <FieldLabel htmlFor={`${prefix}-include`}>Liczone do rebalancingu</FieldLabel>
                <FieldDescription>
                  Kapitał własny tego mieszkania wchodzi do wagi nieruchomości w portfelu.
                </FieldDescription>
              </FieldContent>
            </Field>

            <Field orientation="horizontal">
              <Checkbox
                id={`${prefix}-mortgage`}
                checked={draft.hasMortgage}
                onCheckedChange={(checked) => set("hasMortgage", checked)}
              />
              <FieldContent>
                <FieldLabel htmlFor={`${prefix}-mortgage`}>Hipoteka</FieldLabel>
                <FieldDescription>Saldo kredytu pomniejsza kapitał własny.</FieldDescription>
              </FieldContent>
            </Field>
            {draft.hasMortgage && (
              <div className="grid gap-6 border-l border-border pl-6 sm:grid-cols-3">
                <Field data-invalid={errors.mortgageBalance ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-balance`}>Saldo</FieldLabel>
                  <MoneyInput
                    id={`${prefix}-balance`}
                    value={draft.mortgageBalance}
                    onChange={(v) => set("mortgageBalance", v)}
                    aria-invalid={errors.mortgageBalance ? true : undefined}
                  />
                  <FieldError>{errors.mortgageBalance}</FieldError>
                </Field>
                <Field data-invalid={errors.mortgageRate ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-rate`}>Oprocentowanie</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${prefix}-rate`}
                      inputMode="decimal"
                      value={draft.mortgageRate}
                      onChange={(e) => set("mortgageRate", e.target.value)}
                      placeholder="7,5"
                      aria-invalid={errors.mortgageRate ? true : undefined}
                      className="tabular-nums"
                    />
                    <InputGroupAddon align="inline-end">%</InputGroupAddon>
                  </InputGroup>
                  <FieldError>{errors.mortgageRate}</FieldError>
                </Field>
                <Field data-invalid={errors.mortgageInstallment ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-installment`}>Rata</FieldLabel>
                  <MoneyInput
                    id={`${prefix}-installment`}
                    value={draft.mortgageInstallment}
                    onChange={(v) => set("mortgageInstallment", v)}
                    aria-invalid={errors.mortgageInstallment ? true : undefined}
                  />
                  <FieldError>{errors.mortgageInstallment}</FieldError>
                </Field>
              </div>
            )}

            {draft.usage === "RENTAL" && (
              <div className="grid gap-6 border-l border-border pl-6 sm:grid-cols-3">
                <Field data-invalid={errors.rent ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-rent`}>Czynsz najmu</FieldLabel>
                  <MoneyInput
                    id={`${prefix}-rent`}
                    value={draft.rent}
                    onChange={(v) => set("rent", v)}
                    aria-invalid={errors.rent ? true : undefined}
                  />
                  <FieldDescription>Miesięcznie.</FieldDescription>
                  <FieldError>{errors.rent}</FieldError>
                </Field>
                <Field data-invalid={errors.costs ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-costs`}>Koszty</FieldLabel>
                  <MoneyInput
                    id={`${prefix}-costs`}
                    value={draft.costs}
                    onChange={(v) => set("costs", v)}
                    aria-invalid={errors.costs ? true : undefined}
                  />
                  <FieldDescription>Miesięcznie: czynsz do wspólnoty, podatek.</FieldDescription>
                  <FieldError>{errors.costs}</FieldError>
                </Field>
                <Field data-invalid={errors.vacancy ? true : undefined}>
                  <FieldLabel htmlFor={`${prefix}-vacancy`}>Pustostan</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      id={`${prefix}-vacancy`}
                      inputMode="decimal"
                      value={draft.vacancy}
                      onChange={(e) => set("vacancy", e.target.value)}
                      aria-invalid={errors.vacancy ? true : undefined}
                      className="tabular-nums"
                    />
                    <InputGroupAddon align="inline-end">mies./rok</InputGroupAddon>
                  </InputGroup>
                  <FieldError>{errors.vacancy}</FieldError>
                </Field>
              </div>
            )}
          </FieldGroup>
          {upsert.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać</AlertTitle>
              <AlertDescription>{upsert.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending && <Spinner />}
              Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeletePropertyButton({ id, name }: { id: string; name: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useMutation(
    trpc.realEstate.deleteProperty.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Usuń: ${name}`} />}
        disabled={remove.isPending}
      >
        {remove.isPending ? <Spinner /> : <Trash2 />}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Zniknie razem z hipoteką i danymi najmu; waga nieruchomości przeliczy się od nowa.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Zostaw</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              remove.mutate({ id });
            }}
          >
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GoalDialog({ goal }: { goal: Goal | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal ? moneyToInput(goal.targetMinor) : "");
  const [errors, setErrors] = useState<{ name?: string; target?: string }>({});
  const upsert = useMutation(
    trpc.realEstate.upsertGoal.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const prefix = goal ? `goal-${goal.id}` : "goal-new";

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next: typeof errors = {};
    if (!name.trim()) next.name = "Nazwij cel, np. „Mieszkanie”.";
    const targetMinor = readMoney(target);
    if (targetMinor === null || targetMinor < 1n)
      next.target = "Cel musi być kwotą większą od zera.";
    setErrors(next);
    if (Object.keys(next).length > 0 || targetMinor === null) return;
    upsert.mutate({ id: goal?.id ?? null, name: name.trim(), targetMinor });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          goal ? <Button variant="outline" size="xs" /> : <Button variant="outline" size="sm" />
        }
      >
        {goal ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {goal ? "Edytuj" : "Dodaj cel"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{goal ? "Edycja celu" : "Planowane mieszkanie"}</DialogTitle>
            <DialogDescription>
              Cel dostaje własne konto; plan dopłaca do najstarszego aktywnego celu.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-6">
            <Field data-invalid={errors.name ? true : undefined}>
              <FieldLabel htmlFor={`${prefix}-name`}>Nazwa</FieldLabel>
              <Input
                id={`${prefix}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={errors.name ? true : undefined}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <Field data-invalid={errors.target ? true : undefined}>
              <FieldLabel htmlFor={`${prefix}-target`}>Docelowy wkład własny</FieldLabel>
              <MoneyInput
                id={`${prefix}-target`}
                value={target}
                onChange={setTarget}
                aria-invalid={errors.target ? true : undefined}
              />
              <FieldError>{errors.target}</FieldError>
            </Field>
          </FieldGroup>
          {upsert.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać</AlertTitle>
              <AlertDescription>{upsert.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={upsert.isPending}>
              {upsert.isPending && <Spinner />}
              Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GoalStatusButton({ goal }: { goal: Goal }) {
  const trpc = useTRPC();
  const router = useRouter();
  const setStatus = useMutation(
    trpc.realEstate.setGoalStatus.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  const done = goal.status === "DONE";
  return (
    <Button
      variant="ghost"
      size="xs"
      disabled={setStatus.isPending}
      onClick={() => setStatus.mutate({ id: goal.id, status: done ? "ACTIVE" : "DONE" })}
    >
      {setStatus.isPending && <Spinner />}
      {done ? "Przywróć" : "Oznacz jako zrealizowany"}
    </Button>
  );
}
