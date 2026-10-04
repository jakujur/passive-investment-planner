"use client";

import type { RouterInputs, RouterOutputs } from "@pip/api";
import { formatMoney, money } from "@pip/money";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, type ReactNode, useId, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Stat } from "@/components/stat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { MONEY_FORMAT_HINT, percentOf, readMoney } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type Layout = RouterOutputs["household"]["layouts"][number];
type LayoutId = Layout["id"];
type BootstrapInput = RouterInputs["household"]["bootstrap"];

interface PersonDraft {
  name: string;
  isEntrepreneur: boolean;
}

interface Draft {
  householdName: string;
  layout: LayoutId | null;
  persons: [PersonDraft, PersonDraft];
  monthlyContribution: string;
  monthlyExpenses: string;
  cushionMonths: string;
  cushionBalance: string;
  savesForDownPayment: boolean;
  downPaymentName: string;
  downPaymentTarget: string;
  downPaymentSaved: string;
}

type Errors = Partial<
  Record<
    | "householdName"
    | "layout"
    | "person0"
    | "person1"
    | "monthlyContribution"
    | "monthlyExpenses"
    | "cushionMonths"
    | "cushionBalance"
    | "downPaymentName"
    | "downPaymentTarget"
    | "downPaymentSaved",
    string
  >
>;

const DEFAULT_CUSHION_MONTHS = 9;

function parseMonths(raw: string): number | null {
  if (!/^\d{1,2}$/.test(raw.trim())) return null;
  const value = Number(raw);
  return value <= 36 ? value : null;
}

function validate(draft: Draft, personCount: 1 | 2): Errors {
  const errors: Errors = {};
  if (!draft.householdName.trim()) errors.householdName = "Podaj nazwę gospodarstwa.";
  if (!draft.layout) errors.layout = "Wybierz układ kont.";
  if (!draft.persons[0].name.trim()) errors.person0 = "Podaj imię.";
  if (personCount === 2 && !draft.persons[1].name.trim()) errors.person1 = "Podaj imię.";

  const contribution = readMoney(draft.monthlyContribution);
  if (contribution === null || contribution < 0n) errors.monthlyContribution = MONEY_FORMAT_HINT;
  const expenses = readMoney(draft.monthlyExpenses);
  if (expenses === null || expenses < 0n) errors.monthlyExpenses = MONEY_FORMAT_HINT;
  if (parseMonths(draft.cushionMonths) === null) {
    errors.cushionMonths = "Podaj liczbę miesięcy od 0 do 36.";
  }
  const balance = readMoney(draft.cushionBalance);
  if (balance === null || balance < 0n) errors.cushionBalance = MONEY_FORMAT_HINT;

  if (draft.savesForDownPayment) {
    if (!draft.downPaymentName.trim()) errors.downPaymentName = "Nazwij cel, np. „Mieszkanie”.";
    const target = readMoney(draft.downPaymentTarget);
    if (target === null || target < 1n)
      errors.downPaymentTarget = "Cel musi być kwotą większą od zera.";
    const saved = readMoney(draft.downPaymentSaved);
    if (saved === null || saved < 0n) errors.downPaymentSaved = MONEY_FORMAT_HINT;
  }
  return errors;
}

function toInput(draft: Draft, layout: Layout): BootstrapInput | null {
  const contribution = readMoney(draft.monthlyContribution);
  const expenses = readMoney(draft.monthlyExpenses);
  const months = parseMonths(draft.cushionMonths);
  const balance = readMoney(draft.cushionBalance);
  if (contribution === null || expenses === null || months === null || balance === null) {
    return null;
  }

  let downPayment: BootstrapInput["downPayment"] = null;
  if (draft.savesForDownPayment) {
    const target = readMoney(draft.downPaymentTarget);
    const saved = readMoney(draft.downPaymentSaved);
    if (target === null || saved === null) return null;
    downPayment = { name: draft.downPaymentName.trim(), targetMinor: target, savedMinor: saved };
  }

  return {
    householdName: draft.householdName.trim(),
    layout: layout.id,
    persons: draft.persons.slice(0, layout.persons).map((person) => ({
      name: person.name.trim(),
      isEntrepreneur: person.isEntrepreneur,
    })),
    monthlyContributionMinor: contribution,
    monthlyExpensesMinor: expenses,
    cushionMonths: months,
    cushionBalanceMinor: balance,
    downPayment,
  };
}

export function SetupWizard({ layouts, userName }: { layouts: Layout[]; userName: string }) {
  const router = useRouter();
  const trpc = useTRPC();
  const bootstrap = useMutation(trpc.household.bootstrap.mutationOptions());
  const [submitted, setSubmitted] = useState(false);
  const [draft, setDraft] = useState<Draft>({
    householdName: "",
    layout: null,
    persons: [
      { name: userName, isEntrepreneur: false },
      { name: "", isEntrepreneur: false },
    ],
    monthlyContribution: "",
    monthlyExpenses: "",
    cushionMonths: String(DEFAULT_CUSHION_MONTHS),
    cushionBalance: "",
    savesForDownPayment: false,
    downPaymentName: "Mieszkanie",
    downPaymentTarget: "",
    downPaymentSaved: "0",
  });

  const selectedLayout = layouts.find((layout) => layout.id === draft.layout) ?? null;
  const personCount = selectedLayout?.persons ?? 1;
  const personIndexes: (0 | 1)[] = personCount === 2 ? [0, 1] : [0];
  const errors = submitted ? validate(draft, personCount) : {};

  const expenses = readMoney(draft.monthlyExpenses);
  const months = parseMonths(draft.cushionMonths);
  const balance = readMoney(draft.cushionBalance);
  const cushionTarget =
    expenses !== null && expenses >= 0n && months !== null ? expenses * BigInt(months) : null;

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updatePerson(index: 0 | 1, patch: Partial<PersonDraft>) {
    setDraft((current) => {
      const persons: Draft["persons"] = [current.persons[0], current.persons[1]];
      persons[index] = { ...persons[index], ...patch };
      return { ...current, persons };
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    if (!selectedLayout || Object.keys(validate(draft, personCount)).length > 0) return;
    const input = toInput(draft, selectedLayout);
    if (!input) return;
    await bootstrap.mutateAsync(input);
    router.push("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-12">
      <Section number="01" title="Gospodarstwo" lead="Nazwa widoczna w nagłówku księgi.">
        <Field data-invalid={errors.householdName ? true : undefined}>
          <FieldLabel htmlFor="householdName">Nazwa gospodarstwa</FieldLabel>
          <Input
            id="householdName"
            value={draft.householdName}
            onChange={(event) => update("householdName", event.target.value)}
            placeholder="np. Dom na Woli"
            aria-invalid={errors.householdName ? true : undefined}
          />
          <FieldError>{errors.householdName}</FieldError>
        </Field>
      </Section>

      <Section
        number="02"
        title="Układ kont"
        lead="Układ decyduje, które opakowania (IKE, IKZE) dostaną akcje, a które obligacje, i w jakiej kolejności są wypełniane."
      >
        <Field data-invalid={errors.layout ? true : undefined}>
          <RadioGroup
            aria-label="Układ kont"
            value={draft.layout}
            onValueChange={(value: unknown) => {
              const next = layouts.find((layout) => layout.id === value);
              if (next) update("layout", next.id);
            }}
            className="gap-3"
          >
            {layouts.map((layout) => (
              <LayoutCard key={layout.id} layout={layout} />
            ))}
          </RadioGroup>
          <FieldError>{errors.layout}</FieldError>
        </Field>
      </Section>

      <Section
        number="03"
        title={personCount === 2 ? "Osoby" : "Osoba"}
        lead="Limity IKE i IKZE liczą się osobno dla każdej osoby."
      >
        <FieldGroup className="gap-8">
          {personIndexes.map((index) => (
            <PersonFields
              key={index}
              index={index}
              showOrdinal={personCount === 2}
              person={draft.persons[index]}
              error={index === 0 ? errors.person0 : errors.person1}
              onChange={(patch) => updatePerson(index, patch)}
            />
          ))}
        </FieldGroup>
      </Section>

      <Section
        number="04"
        title="Miesięczna wpłata"
        lead="Stała kwota, którą co miesiąc odkładasz. Plan liczy się z niej automatycznie; w danym miesiącu możesz dopłacić więcej."
      >
        <Field data-invalid={errors.monthlyContribution ? true : undefined} className="sm:max-w-xs">
          <FieldLabel htmlFor="monthlyContribution">Miesięczna wpłata</FieldLabel>
          <MoneyInput
            id="monthlyContribution"
            value={draft.monthlyContribution}
            onChange={(value) => update("monthlyContribution", value)}
            placeholder="np. 10 000"
            aria-invalid={errors.monthlyContribution ? true : undefined}
          />
          <FieldDescription>Możesz wpisać 0 i ustawić ją później.</FieldDescription>
          <FieldError>{errors.monthlyContribution}</FieldError>
        </Field>
      </Section>

      <Section
        number="05"
        title="Poduszka finansowa"
        lead="Zanim nadwyżka trafi do inwestycji, plan dopełnia poduszkę do celu."
      >
        <div className="grid gap-8 sm:grid-cols-2">
          <Field data-invalid={errors.monthlyExpenses ? true : undefined}>
            <FieldLabel htmlFor="monthlyExpenses">Miesięczne wydatki</FieldLabel>
            <MoneyInput
              id="monthlyExpenses"
              value={draft.monthlyExpenses}
              onChange={(value) => update("monthlyExpenses", value)}
              placeholder="np. 12 000"
              aria-invalid={errors.monthlyExpenses ? true : undefined}
            />
            <FieldError>{errors.monthlyExpenses}</FieldError>
          </Field>
          <Field data-invalid={errors.cushionMonths ? true : undefined}>
            <FieldLabel htmlFor="cushionMonths">Miesiące w poduszce</FieldLabel>
            <Input
              id="cushionMonths"
              type="number"
              inputMode="numeric"
              min={0}
              max={36}
              step={1}
              value={draft.cushionMonths}
              onChange={(event) => update("cushionMonths", event.target.value)}
              aria-invalid={errors.cushionMonths ? true : undefined}
              className="tabular-nums"
            />
            <FieldDescription>Od 0 do 36; zwykle 6–12.</FieldDescription>
            <FieldError>{errors.cushionMonths}</FieldError>
          </Field>
          <Field data-invalid={errors.cushionBalance ? true : undefined}>
            <FieldLabel htmlFor="cushionBalance">Obecny stan poduszki</FieldLabel>
            <MoneyInput
              id="cushionBalance"
              value={draft.cushionBalance}
              onChange={(value) => update("cushionBalance", value)}
              aria-invalid={errors.cushionBalance ? true : undefined}
            />
            <FieldError>{errors.cushionBalance}</FieldError>
          </Field>
          <div className="flex flex-col justify-end gap-4 border-l border-border pl-6">
            <Stat
              label="Cel poduszki"
              value={cushionTarget !== null ? formatMoney(money(cushionTarget)) : "—"}
              tone={cushionTarget !== null ? "default" : "muted"}
              hint={
                cushionTarget !== null
                  ? `${draft.monthlyExpenses.trim()} zł × ${months} mies.`
                  : "Wydatki × miesiące"
              }
            />
            {cushionTarget !== null && cushionTarget > 0n && balance !== null && balance >= 0n && (
              <Progress
                value={Math.min(100, percentOf(balance, cushionTarget))}
                aria-label="Wypełnienie poduszki"
              />
            )}
          </div>
        </div>
      </Section>

      <Section
        number="06"
        title="Mieszkanie"
        lead="Opcjonalnie. Część nadwyżki przypisana nieruchomościom trafia na ten cel zamiast do portfela."
      >
        <FieldGroup className="gap-8">
          <Field orientation="horizontal">
            <Checkbox
              id="savesForDownPayment"
              checked={draft.savesForDownPayment}
              onCheckedChange={(checked) => update("savesForDownPayment", checked)}
            />
            <FieldContent>
              <FieldLabel htmlFor="savesForDownPayment">
                Zbieram na wkład własny lub zakup
              </FieldLabel>
              <FieldDescription>
                Odkłada na osobnym koncie bankowym poza portfelem.
              </FieldDescription>
            </FieldContent>
          </Field>
          {draft.savesForDownPayment && (
            <div className="grid gap-8 sm:grid-cols-2">
              <Field
                className="sm:col-span-2"
                data-invalid={errors.downPaymentName ? true : undefined}
              >
                <FieldLabel htmlFor="downPaymentName">Nazwa celu</FieldLabel>
                <Input
                  id="downPaymentName"
                  value={draft.downPaymentName}
                  onChange={(event) => update("downPaymentName", event.target.value)}
                  aria-invalid={errors.downPaymentName ? true : undefined}
                />
                <FieldError>{errors.downPaymentName}</FieldError>
              </Field>
              <Field data-invalid={errors.downPaymentTarget ? true : undefined}>
                <FieldLabel htmlFor="downPaymentTarget">Kwota do zebrania</FieldLabel>
                <MoneyInput
                  id="downPaymentTarget"
                  value={draft.downPaymentTarget}
                  onChange={(value) => update("downPaymentTarget", value)}
                  placeholder="np. 150 000"
                  aria-invalid={errors.downPaymentTarget ? true : undefined}
                />
                <FieldError>{errors.downPaymentTarget}</FieldError>
              </Field>
              <Field data-invalid={errors.downPaymentSaved ? true : undefined}>
                <FieldLabel htmlFor="downPaymentSaved">Już odłożone</FieldLabel>
                <MoneyInput
                  id="downPaymentSaved"
                  value={draft.downPaymentSaved}
                  onChange={(value) => update("downPaymentSaved", value)}
                  aria-invalid={errors.downPaymentSaved ? true : undefined}
                />
                <FieldError>{errors.downPaymentSaved}</FieldError>
              </Field>
            </div>
          )}
        </FieldGroup>
      </Section>

      <div className="flex flex-col gap-6 border-t border-border pt-8">
        {bootstrap.error && (
          <Alert variant="destructive">
            <AlertTitle>Nie udało się utworzyć gospodarstwa</AlertTitle>
            <AlertDescription>{bootstrap.error.message}</AlertDescription>
          </Alert>
        )}
        {submitted && Object.keys(errors).length > 0 && (
          <p role="alert" className="text-sm text-destructive">
            Popraw zaznaczone pola, żeby utworzyć gospodarstwo.
          </p>
        )}
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Wagi klas i instrumenty dostaniesz domyślne; zmienisz je później.
          </p>
          <Button type="submit" size="lg" disabled={bootstrap.isPending}>
            {bootstrap.isPending && <Spinner />}
            Utwórz gospodarstwo
          </Button>
        </div>
      </div>
    </form>
  );
}

function Section({
  number,
  title,
  lead,
  children,
}: {
  number: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className="grid gap-6 border-t border-border pt-8 md:grid-cols-[5rem_minmax(0,1fr)] md:gap-8"
    >
      <span aria-hidden className="font-heading text-3xl text-muted-foreground tabular-nums">
        {number}
      </span>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 id={headingId} className="font-heading text-2xl">
            {title}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{lead}</p>
        </div>
        {children}
      </div>
    </section>
  );
}

function LayoutCard({ layout }: { layout: Layout }) {
  const id = `layout-${layout.id}`;
  const titleId = `${id}-title`;
  const summaryId = `${id}-summary`;
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        <RadioGroupItem
          value={layout.id}
          id={id}
          aria-labelledby={titleId}
          aria-describedby={summaryId}
        />
        <FieldContent className="gap-3">
          <span
            id={titleId}
            className="font-heading text-lg leading-snug font-medium tracking-normal normal-case"
          >
            {layout.title}
          </span>
          <FieldDescription id={summaryId}>{layout.summary}</FieldDescription>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm font-normal tracking-normal normal-case">
            <Queue label="Akcje" items={layout.equityQueue} />
            <Queue label="Obligacje" items={layout.bondsQueue} />
          </dl>
        </FieldContent>
      </Field>
    </FieldLabel>
  );
}

function Queue({ label, items }: { label: string; items: string[] }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static queue; the same account name can appear twice
          <span key={`${index}-${item}`} className="inline-flex items-center gap-1.5">
            {index > 0 && <ArrowRight aria-hidden className="size-3 text-muted-foreground" />}
            {item}
          </span>
        ))}
      </dd>
    </>
  );
}

function PersonFields({
  index,
  showOrdinal,
  person,
  error,
  onChange,
}: {
  index: 0 | 1;
  showOrdinal: boolean;
  person: PersonDraft;
  error: string | undefined;
  onChange: (patch: Partial<PersonDraft>) => void;
}) {
  const nameId = `person-${index}-name`;
  const entrepreneurId = `person-${index}-entrepreneur`;
  return (
    <fieldset className="flex flex-col gap-6">
      {showOrdinal && (
        <legend className="mb-4 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Osoba {index + 1}
        </legend>
      )}
      <Field data-invalid={error ? true : undefined}>
        <FieldLabel htmlFor={nameId}>Imię</FieldLabel>
        <Input
          id={nameId}
          autoComplete="off"
          value={person.name}
          onChange={(event) => onChange({ name: event.target.value })}
          aria-invalid={error ? true : undefined}
        />
        <FieldError>{error}</FieldError>
      </Field>
      <Field orientation="horizontal">
        <Checkbox
          id={entrepreneurId}
          checked={person.isEntrepreneur}
          onCheckedChange={(checked) => onChange({ isEntrepreneur: checked })}
        />
        <FieldContent>
          <FieldLabel htmlFor={entrepreneurId}>Prowadzi działalność gospodarczą</FieldLabel>
          <FieldDescription>
            Osoby prowadzące działalność mają wyższy roczny limit wpłat na IKZE.
          </FieldDescription>
        </FieldContent>
      </Field>
    </fieldset>
  );
}
