import { addMonths, completeTerms, type InstallmentType, monthsBetween } from "@pip/engine";
import { formatPln, MONEY_FORMAT_HINT, readMoney, readPercentBp } from "@/lib/format";

export const INSTALLMENT_TYPE_LABEL: Record<InstallmentType, string> = {
  EQUAL: "Równe",
  DECREASING: "Malejące",
};

export const OVERPAYMENT_MODE_LABEL = {
  SHORTEN: "Skraca okres",
  LOWER_INSTALLMENT: "Obniża ratę",
} as const;

const shortMonthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "short", year: "numeric" });

/** `YYYY-MM` → "lis 2051". */
export function formatMonthShort(month: string): string {
  return shortMonthFormatter.format(new Date(`${month}-01T00:00:00`));
}

export function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/** Which of the installment ↔ last-month pair the user types; the API computes the other. */
export type KnownTerm = "INSTALLMENT" | "END_MONTH";

export const KNOWN_TERM_LABEL: Record<KnownTerm, string> = {
  INSTALLMENT: "Ratę",
  END_MONTH: "Termin spłaty",
};

export function isKnownTerm(value: unknown): value is KnownTerm {
  return value === "INSTALLMENT" || value === "END_MONTH";
}

export interface MortgageTermsDraft {
  balance: string;
  rate: string;
  installmentType: InstallmentType;
  known: KnownTerm;
  installment: string;
  endMonth: string;
}

export type KnownTermInput =
  | { ok: true; installmentMinor: bigint | null; endMonth: string | null }
  | { ok: false; field: "installment" | "endMonth"; message: string };

/** Reads only the selected term; the other one goes to the API as `null`. */
export function readKnownTerm(
  draft: Pick<MortgageTermsDraft, "known" | "installment" | "endMonth">,
): KnownTermInput {
  if (draft.known === "INSTALLMENT") {
    const raw = draft.installment.trim();
    if (raw === "") return { ok: false, field: "installment", message: "Podaj ratę." };
    const installment = readMoney(raw);
    if (installment === null || installment < 0n) {
      return { ok: false, field: "installment", message: MONEY_FORMAT_HINT };
    }
    return { ok: true, installmentMinor: installment, endMonth: null };
  }
  const endMonth = draft.endMonth.trim();
  if (endMonth === "") {
    return { ok: false, field: "endMonth", message: "Podaj miesiąc ostatniej raty." };
  }
  if (!/^\d{4}-\d{2}$/.test(endMonth)) {
    return { ok: false, field: "endMonth", message: "Podaj miesiąc, np. 2051-11." };
  }
  return { ok: true, installmentMinor: null, endMonth };
}

export type MortgageTerms =
  | { ok: true; installmentMinor: bigint; monthsLeft: number; endMonth: string | null }
  | { ok: false; reason: "incomplete" | "known" | "uncovered" };

/** Completes the selected term the way the API will, for a live hint. */
export function resolveMortgageTerms(draft: MortgageTermsDraft, stateMonth: string): MortgageTerms {
  const balance = readMoney(draft.balance);
  const rateBp = readPercentBp(draft.rate);
  if (balance === null || balance < 0n || rateBp === null || rateBp < 0) {
    return { ok: false, reason: "incomplete" };
  }
  const known = readKnownTerm(draft);
  if (!known.ok) return { ok: false, reason: "known" };
  const terms = completeTerms({
    balanceMinor: balance,
    rateBp,
    installmentType: draft.installmentType,
    monthsLeft: known.endMonth ? Math.max(0, monthsBetween(stateMonth, known.endMonth)) : null,
    installmentMinor: known.installmentMinor,
  });
  if (!terms) return { ok: false, reason: "uncovered" };
  return {
    ok: true,
    installmentMinor: terms.installmentMinor,
    monthsLeft: terms.monthsLeft,
    endMonth: terms.monthsLeft > 0 ? addMonths(stateMonth, terms.monthsLeft) : null,
  };
}

const installmentsPlural = new Intl.PluralRules("pl-PL");
const INSTALLMENTS_WORD: Partial<Record<Intl.LDMLPluralRule, string>> = {
  one: "rata",
  few: "raty",
};

/** The term the user did not type: „Termin spłaty: lis 2051 · 295 rat” or „Rata: ≈ 2 878,36 zł”. */
export function mortgageTermsHint(known: KnownTerm, terms: MortgageTerms): string {
  if (!terms.ok) {
    switch (terms.reason) {
      case "incomplete":
        return known === "INSTALLMENT"
          ? "Wpisz saldo i oprocentowanie, a policzymy termin spłaty."
          : "Wpisz saldo i oprocentowanie, a policzymy ratę.";
      case "known":
        return known === "INSTALLMENT"
          ? "Wpisz ratę, a policzymy termin spłaty."
          : "Wybierz miesiąc ostatniej raty, a policzymy ratę.";
      case "uncovered":
        return "Taka rata nie pokrywa nawet odsetek.";
    }
  }
  if (known === "END_MONTH") return `Rata: ≈ ${formatPln(terms.installmentMinor)}`;
  if (!terms.endMonth) return "Termin spłaty: kredyt spłacony";
  const word = INSTALLMENTS_WORD[installmentsPlural.select(terms.monthsLeft)] ?? "rat";
  return `Termin spłaty: ${formatMonthShort(terms.endMonth)} · ${terms.monthsLeft} ${word}`;
}
