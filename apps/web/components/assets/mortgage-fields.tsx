"use client";

import { MoneyInput } from "@/components/money-input";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  isKnownTerm,
  KNOWN_TERM_LABEL,
  type MortgageTermsDraft,
  mortgageTermsHint,
  resolveMortgageTerms,
} from "@/lib/mortgage";
import { cn } from "@/lib/utils";

export type MortgageTermsErrors = Partial<Record<keyof MortgageTermsDraft, string>>;

/**
 * Balance, rate and one of installment ↔ last month (the user picks which); the live hint
 * shows the other one, computed like the API will.
 */
export function MortgageTermsFields({
  prefix,
  draft,
  errors,
  set,
  stateMonth,
  balanceHint,
}: {
  prefix: string;
  draft: MortgageTermsDraft;
  errors: MortgageTermsErrors;
  set: <K extends keyof MortgageTermsDraft>(key: K, value: MortgageTermsDraft[K]) => void;
  stateMonth: string;
  balanceHint: string;
}) {
  const terms = resolveMortgageTerms(draft, stateMonth);
  const knownError = draft.known === "INSTALLMENT" ? errors.installment : errors.endMonth;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field data-invalid={errors.balance ? true : undefined}>
        <FieldLabel htmlFor={`${prefix}-balance`}>Saldo kredytu</FieldLabel>
        <MoneyInput
          id={`${prefix}-balance`}
          value={draft.balance}
          onChange={(v) => set("balance", v)}
          aria-invalid={errors.balance ? true : undefined}
        />
        <FieldDescription>{balanceHint}</FieldDescription>
        <FieldError>{errors.balance}</FieldError>
      </Field>
      <Field data-invalid={errors.rate ? true : undefined}>
        <FieldLabel htmlFor={`${prefix}-rate`}>Oprocentowanie</FieldLabel>
        <InputGroup>
          <InputGroupInput
            id={`${prefix}-rate`}
            inputMode="decimal"
            value={draft.rate}
            onChange={(e) => set("rate", e.target.value)}
            placeholder="7,5"
            aria-invalid={errors.rate ? true : undefined}
            className="tabular-nums"
          />
          <InputGroupAddon align="inline-end">% rocznie</InputGroupAddon>
        </InputGroup>
        <FieldError>{errors.rate}</FieldError>
      </Field>
      <Field>
        <FieldLabel>Znam</FieldLabel>
        <RadioGroup
          aria-label="Znam"
          value={draft.known}
          onValueChange={(value: unknown) => {
            if (isKnownTerm(value)) set("known", value);
          }}
          className="grid-cols-2"
        >
          {(["INSTALLMENT", "END_MONTH"] as const).map((known) => (
            <FieldLabel key={known} htmlFor={`${prefix}-known-${known}`}>
              <Field orientation="horizontal">
                <RadioGroupItem value={known} id={`${prefix}-known-${known}`} />
                <FieldContent>
                  <span className="text-sm font-normal normal-case tracking-normal">
                    {KNOWN_TERM_LABEL[known]}
                  </span>
                </FieldContent>
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>
      </Field>
      <Field data-invalid={knownError ? true : undefined}>
        {draft.known === "INSTALLMENT" ? (
          <>
            <FieldLabel htmlFor={`${prefix}-installment`}>Rata</FieldLabel>
            <MoneyInput
              id={`${prefix}-installment`}
              value={draft.installment}
              onChange={(v) => set("installment", v)}
              aria-invalid={knownError ? true : undefined}
            />
          </>
        ) : (
          <>
            <FieldLabel htmlFor={`${prefix}-end`}>Ostatnia rata</FieldLabel>
            <Input
              id={`${prefix}-end`}
              type="month"
              min={stateMonth}
              value={draft.endMonth}
              onChange={(e) => set("endMonth", e.target.value)}
              aria-invalid={knownError ? true : undefined}
              className="tabular-nums"
            />
          </>
        )}
        {knownError ? (
          <FieldError>{knownError}</FieldError>
        ) : (
          <FieldDescription className={cn("tabular-nums", terms.ok && "text-foreground")}>
            {mortgageTermsHint(draft.known, terms)}
          </FieldDescription>
        )}
      </Field>
    </div>
  );
}
