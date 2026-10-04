"use client";

import type { RouterInputs, RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { KeyRound, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MortgageTermsFields } from "@/components/assets/mortgage-fields";
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
import { Switch } from "@/components/ui/switch";
import {
  bpToInput,
  formatPln,
  MONEY_FORMAT_HINT,
  moneyToInput,
  readMoney,
  readPercentBp,
  todayIso,
} from "@/lib/format";
import {
  currentMonth,
  INSTALLMENT_TYPE_LABEL,
  isKnownTerm,
  type KnownTerm,
  type MortgageTermsDraft,
  OVERPAYMENT_MODE_LABEL,
  readKnownTerm,
  resolveMortgageTerms,
} from "@/lib/mortgage";
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
  mortgageKnown: KnownTerm;
  mortgageInstallment: string;
  mortgageEndMonth: string;
  installmentType: "EQUAL" | "DECREASING";
  overpaymentMode: "SHORTEN" | "LOWER_INSTALLMENT";
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
    // A new mortgage is known by its term from the contract; an existing one by its installment.
    mortgageKnown: property?.mortgage ? "INSTALLMENT" : "END_MONTH",
    mortgageInstallment: property?.mortgage ? moneyToInput(property.mortgage.installmentMinor) : "",
    mortgageEndMonth: property?.mortgage?.endMonth ?? "",
    installmentType: property?.mortgage?.installmentType ?? "EQUAL",
    overpaymentMode: property?.mortgage?.overpaymentMode ?? "SHORTEN",
    rent: property?.rental ? moneyToInput(property.rental.rentMinor) : "",
    costs: property?.rental ? moneyToInput(property.rental.costsMinor) : "0",
    vacancy: property?.rental?.vacancyMonthsPerYear ?? "1",
  };
}

/** A goal turning into a flat: rented by default (so it counts in the portfolio), financed by a mortgage. */
function draftFromGoal(goal: Goal): PropertyDraft {
  return {
    ...draftFrom(null),
    name: goal.name,
    usage: "RENTAL",
    includeInRebalancing: true,
    hasMortgage: true,
  };
}

function mortgageTermsDraft(d: PropertyDraft): MortgageTermsDraft {
  return {
    balance: d.mortgageBalance,
    rate: d.mortgageRate,
    installmentType: d.installmentType,
    known: d.mortgageKnown,
    installment: d.mortgageInstallment,
    endMonth: d.mortgageEndMonth,
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
    if (balance === null || balance < 0n) errors.mortgageBalance = MONEY_FORMAT_HINT;
    if (rateBp === null || rateBp < 0 || rateBp > 5000)
      errors.mortgageRate = "Podaj oprocentowanie w %, np. 7,5.";
    const terms = mortgageTermsDraft(d);
    const known = readKnownTerm(terms);
    if (!known.ok) {
      errors[known.field === "installment" ? "mortgageInstallment" : "mortgageEndMonth"] =
        known.message;
    } else {
      const resolved = resolveMortgageTerms(terms, currentMonth());
      if (!resolved.ok && resolved.reason === "uncovered")
        errors.mortgageInstallment = "Taka rata nie pokrywa odsetek.";
    }
    if (balance !== null && rateBp !== null && known.ok && !errors.mortgageInstallment) {
      mortgage = {
        balanceMinor: balance,
        rateBp,
        installmentType: d.installmentType,
        overpaymentMode: d.overpaymentMode,
        installmentMinor: known.installmentMinor,
        endMonth: known.endMonth,
      };
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

function usePropertyDraft(initial: () => PropertyDraft) {
  const [draft, setDraft] = useState<PropertyDraft>(initial);
  const [errors, setErrors] = useState<PropertyErrors>({});
  const set = <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));
  const reset = (next: PropertyDraft) => {
    setDraft(next);
    setErrors({});
  };
  return { draft, errors, set, setErrors, reset };
}

/** The property form body shared by "add / edit" and "Kupione"; `savedMinor` turns on the purchase hints. */
function PropertyFields({
  prefix,
  draft,
  errors,
  set,
  savedMinor,
}: {
  prefix: string;
  draft: PropertyDraft;
  errors: PropertyErrors;
  set: <K extends keyof PropertyDraft>(key: K, value: PropertyDraft[K]) => void;
  savedMinor?: bigint;
}) {
  const buying = savedMinor !== undefined;
  const [balanceTouched, setBalanceTouched] = useState(false);

  function setValue(raw: string) {
    set("value", raw);
    if (!buying || balanceTouched || !draft.hasMortgage) return;
    const price = readMoney(raw);
    if (price === null) return;
    const suggested = price > savedMinor ? price - savedMinor : 0n;
    set("mortgageBalance", moneyToInput(suggested));
  }

  return (
    <FieldGroup className="gap-5">
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

      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <FieldLabel>Przeznaczenie</FieldLabel>
          <RadioGroup
            aria-label="Przeznaczenie"
            value={draft.usage}
            onValueChange={(value: unknown) => {
              if (value !== "OWN" && value !== "RENTAL") return;
              set("usage", value);
              // Rented flats count in the portfolio by default; the flat you live in does not.
              set("includeInRebalancing", value === "RENTAL");
            }}
            className="grid-cols-2"
          >
            <FieldLabel htmlFor={`${prefix}-rental`}>
              <Field orientation="horizontal">
                <RadioGroupItem value="RENTAL" id={`${prefix}-rental`} />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">Wynajem</span>
                </FieldContent>
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor={`${prefix}-own`}>
              <Field orientation="horizontal">
                <RadioGroupItem value="OWN" id={`${prefix}-own`} />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">Własne</span>
                </FieldContent>
              </Field>
            </FieldLabel>
          </RadioGroup>
        </Field>
        <Field>
          <FieldLabel>Finansowanie</FieldLabel>
          <RadioGroup
            aria-label="Finansowanie"
            value={draft.hasMortgage ? "MORTGAGE" : "CASH"}
            onValueChange={(value: unknown) => {
              if (value === "MORTGAGE" || value === "CASH")
                set("hasMortgage", value === "MORTGAGE");
            }}
            className="grid-cols-2"
          >
            <FieldLabel htmlFor={`${prefix}-cash`}>
              <Field orientation="horizontal">
                <RadioGroupItem value="CASH" id={`${prefix}-cash`} />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">Gotówka</span>
                </FieldContent>
              </Field>
            </FieldLabel>
            <FieldLabel htmlFor={`${prefix}-mortgage`}>
              <Field orientation="horizontal">
                <RadioGroupItem value="MORTGAGE" id={`${prefix}-mortgage`} />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">Hipoteka</span>
                </FieldContent>
              </Field>
            </FieldLabel>
          </RadioGroup>
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field data-invalid={errors.value ? true : undefined}>
          <FieldLabel htmlFor={`${prefix}-value`}>{buying ? "Cena zakupu" : "Wartość"}</FieldLabel>
          <MoneyInput
            id={`${prefix}-value`}
            value={draft.value}
            onChange={setValue}
            aria-invalid={errors.value ? true : undefined}
          />
          {buying && <FieldDescription>Odłożone środki: {formatPln(savedMinor)}.</FieldDescription>}
          <FieldError>{errors.value}</FieldError>
        </Field>
        <Field data-invalid={errors.valuationDate ? true : undefined}>
          <FieldLabel htmlFor={`${prefix}-date`}>
            {buying ? "Data zakupu" : "Data wyceny"}
          </FieldLabel>
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

      {draft.hasMortgage && (
        <div className="flex flex-col gap-4 border-l border-border pl-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Rodzaj rat</FieldLabel>
              <RadioGroup
                aria-label="Rodzaj rat"
                value={draft.installmentType}
                onValueChange={(value: unknown) => {
                  if (value === "EQUAL" || value === "DECREASING") set("installmentType", value);
                }}
                className="grid-cols-2"
              >
                {(["EQUAL", "DECREASING"] as const).map((type) => (
                  <FieldLabel key={type} htmlFor={`${prefix}-type-${type}`}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={type} id={`${prefix}-type-${type}`} />
                      <FieldContent>
                        <span className="text-sm font-normal normal-case tracking-normal">
                          {INSTALLMENT_TYPE_LABEL[type]}
                        </span>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </Field>
            <Field>
              <FieldLabel>Po nadpłacie bank</FieldLabel>
              <RadioGroup
                aria-label="Po nadpłacie bank"
                value={draft.overpaymentMode}
                onValueChange={(value: unknown) => {
                  if (value === "SHORTEN" || value === "LOWER_INSTALLMENT")
                    set("overpaymentMode", value);
                }}
                className="grid-cols-2"
              >
                {(["SHORTEN", "LOWER_INSTALLMENT"] as const).map((mode) => (
                  <FieldLabel key={mode} htmlFor={`${prefix}-mode-${mode}`}>
                    <Field orientation="horizontal">
                      <RadioGroupItem value={mode} id={`${prefix}-mode-${mode}`} />
                      <FieldContent>
                        <span className="text-sm font-normal normal-case tracking-normal">
                          {OVERPAYMENT_MODE_LABEL[mode]}
                        </span>
                      </FieldContent>
                    </Field>
                  </FieldLabel>
                ))}
              </RadioGroup>
            </Field>
          </div>
          <MortgageTermsFields
            prefix={`${prefix}-mortgage`}
            draft={mortgageTermsDraft(draft)}
            errors={{
              balance: errors.mortgageBalance,
              rate: errors.mortgageRate,
              installment: errors.mortgageInstallment,
              endMonth: errors.mortgageEndMonth,
            }}
            set={(key, value) => {
              if (key === "balance") {
                setBalanceTouched(true);
                set("mortgageBalance", value);
              } else if (key === "rate") set("mortgageRate", value);
              else if (isKnownTerm(value)) set("mortgageKnown", value);
              else if (key === "installment") set("mortgageInstallment", value);
              else if (key === "endMonth") set("mortgageEndMonth", value);
            }}
            stateMonth={currentMonth()}
            balanceHint={
              buying
                ? "Saldo i rata po pierwszej racie. Podpowiedź: cena minus odłożone środki."
                : "Saldo i rata po zapłaceniu raty w tym miesiącu (jak na wyciągu)."
            }
          />
        </div>
      )}

      {draft.usage === "RENTAL" && (
        <div className="grid gap-5 border-l border-border pl-5 sm:grid-cols-3">
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

      <Field orientation="horizontal" className="border-t border-border pt-5">
        <Switch
          id={`${prefix}-include`}
          checked={draft.includeInRebalancing}
          onCheckedChange={(checked) => set("includeInRebalancing", checked)}
        />
        <FieldContent>
          <FieldLabel htmlFor={`${prefix}-include`}>Liczone do portfela</FieldLabel>
          <FieldDescription>
            Kapitał własny tego mieszkania wchodzi do wagi nieruchomości w portfelu. Saldo kredytu
            pomniejsza kapitał własny.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  );
}

export function PropertyDialog({ property }: { property: Property | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { draft, errors, set, setErrors, reset } = usePropertyDraft(() => draftFrom(property));
  const upsert = useMutation(
    trpc.realEstate.upsertProperty.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const prefix = property ? `prop-${property.id}` : "prop-new";

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset(draftFrom(property));
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
        render={
          property ? <Button variant="outline" size="xs" /> : <Button variant="outline" size="sm" />
        }
      >
        {property ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}
        {property ? "Edytuj" : "Dodaj posiadane mieszkanie"}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{property ? "Edycja mieszkania" : "Posiadane mieszkanie"}</DialogTitle>
            <DialogDescription>
              Wartość i zadłużenie liczą się do majątku; czynsz najmu daje rentowność netto.
            </DialogDescription>
          </DialogHeader>
          {open && <PropertyFields prefix={prefix} draft={draft} errors={errors} set={set} />}
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

/** "Kupione": closes the goal and records the flat in one step, prefilled from the goal. */
export function CompleteGoalDialog({ goal }: { goal: Goal }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { draft, errors, set, setErrors, reset } = usePropertyDraft(() => draftFromGoal(goal));
  const complete = useMutation(
    trpc.realEstate.completeGoal.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  const prefix = `buy-${goal.id}`;

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      reset(draftFromGoal(goal));
      complete.reset();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = toPropertyInput(null, draft);
    if ("errors" in result) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    complete.mutate({ goalId: goal.id, property: result.input });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={<Button size="xs" />}>
        <KeyRound data-icon="inline-start" />
        Kupione
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Kupione: {goal.name}</DialogTitle>
            <DialogDescription>
              Cel zostanie zamknięty, a mieszkanie trafi do posiadanych. Odłożone środki (
              {formatPln(goal.savedMinor)}) zostają na koncie celu.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <PropertyFields
              prefix={prefix}
              draft={draft}
              errors={errors}
              set={set}
              savedMinor={goal.savedMinor}
            />
          )}
          {complete.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać</AlertTitle>
              <AlertDescription>{complete.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={complete.isPending}>
              {complete.isPending && <Spinner />}
              Zapisz mieszkanie
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
        {goal ? "Edytuj" : "Nowy cel"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{goal ? "Edycja celu" : "Nowy cel: wkład własny lub zakup"}</DialogTitle>
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
                placeholder="np. Mieszkanie na wynajem"
                aria-invalid={errors.name ? true : undefined}
              />
              <FieldError>{errors.name}</FieldError>
            </Field>
            <Field data-invalid={errors.target ? true : undefined}>
              <FieldLabel htmlFor={`${prefix}-target`}>Kwota do zebrania</FieldLabel>
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
