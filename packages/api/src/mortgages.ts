import { schema, type Tx } from "@pip/db";
import {
  addMonths,
  applyOverpayment,
  completeTerms,
  interestSaved,
  type MortgageState,
  monthsBetween,
  payInstallment,
} from "@pip/engine";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";

type MortgageRow = typeof schema.mortgage.$inferSelect;
type EntryRow = typeof schema.mortgageEntry.$inferSelect;

export async function latestEntry(tx: Tx, mortgageId: string): Promise<EntryRow | undefined> {
  const [entry] = await tx
    .select()
    .from(schema.mortgageEntry)
    .where(eq(schema.mortgageEntry.mortgageId, mortgageId))
    .orderBy(desc(schema.mortgageEntry.date), desc(schema.mortgageEntry.seq))
    .limit(1);
  return entry;
}

/** Engine state after an entry; the end month (or, for old rows, the installment) sets the term. */
export function stateAfter(mortgage: MortgageRow, entry: EntryRow): MortgageState {
  const month = entry.date.slice(0, 7);
  const terms = completeTerms({
    balanceMinor: entry.balanceAfterMinor,
    rateBp: entry.rateBp,
    installmentType: mortgage.installmentType,
    monthsLeft: entry.endMonth ? Math.max(0, monthsBetween(month, entry.endMonth)) : null,
    installmentMinor: entry.endMonth ? entry.installmentMinor : entry.installmentMinor || null,
  });
  return {
    balanceMinor: entry.balanceAfterMinor,
    rateBp: entry.rateBp,
    installmentMinor: terms?.installmentMinor ?? entry.installmentMinor,
    monthsLeft: terms?.monthsLeft ?? 0,
    installmentType: mortgage.installmentType,
    overpaymentMode: mortgage.overpaymentMode,
  };
}

function endMonthOf(state: MortgageState, month: string): string | null {
  return state.monthsLeft > 0 ? addMonths(month, state.monthsLeft) : null;
}

/** Copies the latest entry's state onto the mortgage row, which the plan and pages read. */
export async function recomputeMortgage(tx: Tx, mortgageId: string) {
  const [mortgage] = await tx
    .select()
    .from(schema.mortgage)
    .where(eq(schema.mortgage.id, mortgageId));
  const entry = await latestEntry(tx, mortgageId);
  if (!mortgage || !entry) return;
  const state = stateAfter(mortgage, entry);
  await tx
    .update(schema.mortgage)
    .set({
      balanceMinor: state.balanceMinor,
      rateBp: state.rateBp,
      installmentMinor: state.installmentMinor,
      endMonth: endMonthOf(state, entry.date.slice(0, 7)),
    })
    .where(eq(schema.mortgage.id, mortgageId));
}

/**
 * A state read from the bank (after that month's installment). Fills in the installment or the
 * end month, whichever was not given.
 */
export async function addBankEntry(
  tx: Tx,
  mortgage: MortgageRow,
  input: {
    date: string;
    balanceMinor: bigint;
    rateBp: number;
    installmentMinor: bigint | null;
    endMonth: string | null;
  },
) {
  const month = input.date.slice(0, 7);
  const terms = completeTerms({
    balanceMinor: input.balanceMinor,
    rateBp: input.rateBp,
    installmentType: mortgage.installmentType,
    monthsLeft: input.endMonth ? Math.max(0, monthsBetween(month, input.endMonth)) : null,
    installmentMinor: input.installmentMinor,
  });
  if (!terms) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Rata nie pokrywa nawet odsetek — sprawdź ratę, oprocentowanie albo podaj datę ostatniej raty.",
    });
  }
  await tx.insert(schema.mortgageEntry).values({
    mortgageId: mortgage.id,
    kind: "BANK",
    date: input.date,
    balanceAfterMinor: input.balanceMinor,
    rateBp: input.rateBp,
    installmentMinor: terms.installmentMinor,
    endMonth: terms.monthsLeft > 0 ? addMonths(month, terms.monthsLeft) : null,
  });
  await recomputeMortgage(tx, mortgage.id);
}

/**
 * Books a month for every mortgage of the household: the regular installment (unless the latest
 * entry is already from this month) and the plan's overpayment, if any.
 */
export async function bookMortgages(
  tx: Tx,
  householdId: string,
  planId: string,
  date: string,
  overpayments: ReadonlyMap<string, bigint>,
) {
  const month = date.slice(0, 7);
  const mortgages = await tx
    .select({ mortgage: schema.mortgage })
    .from(schema.mortgage)
    .innerJoin(schema.property, eq(schema.property.id, schema.mortgage.propertyId))
    .where(eq(schema.property.householdId, householdId));
  for (const { mortgage } of mortgages) {
    const entry = await latestEntry(tx, mortgage.id);
    if (!entry) continue;
    let state = stateAfter(mortgage, entry);
    if (entry.date.slice(0, 7) < month && state.balanceMinor > 0n && state.monthsLeft > 0) {
      const paid = payInstallment(state);
      state = paid.state;
      await tx.insert(schema.mortgageEntry).values({
        mortgageId: mortgage.id,
        planId,
        kind: "INSTALLMENT",
        date,
        amountMinor: paid.paidMinor,
        principalMinor: paid.principalMinor,
        interestMinor: paid.interestMinor,
        balanceAfterMinor: state.balanceMinor,
        rateBp: state.rateBp,
        installmentMinor: state.installmentMinor,
        endMonth: endMonthOf(state, month),
      });
    }
    const overpayment = overpayments.get(mortgage.id);
    if (overpayment && overpayment > 0n) {
      const after = applyOverpayment(state, overpayment);
      await tx.insert(schema.mortgageEntry).values({
        mortgageId: mortgage.id,
        planId,
        kind: "OVERPAYMENT",
        date,
        amountMinor: overpayment,
        principalMinor: state.balanceMinor - after.balanceMinor,
        interestSavedMinor: interestSaved(state, after, month),
        balanceAfterMinor: after.balanceMinor,
        rateBp: after.rateBp,
        installmentMinor: after.installmentMinor,
        endMonth: endMonthOf(after, month),
      });
    }
    await recomputeMortgage(tx, mortgage.id);
  }
}

/** Removes a booked month's mortgage entries and restores the mortgages' current state. */
export async function unbookMortgages(tx: Tx, planId: string) {
  const removed = await tx
    .delete(schema.mortgageEntry)
    .where(eq(schema.mortgageEntry.planId, planId))
    .returning({ mortgageId: schema.mortgageEntry.mortgageId });
  for (const mortgageId of new Set(removed.map((r) => r.mortgageId))) {
    await recomputeMortgage(tx, mortgageId);
  }
}

export async function householdMortgage(tx: Tx, householdId: string, propertyId: string) {
  const [row] = await tx
    .select({ mortgage: schema.mortgage })
    .from(schema.mortgage)
    .innerJoin(schema.property, eq(schema.property.id, schema.mortgage.propertyId))
    .where(and(eq(schema.property.id, propertyId), eq(schema.property.householdId, householdId)));
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "To mieszkanie nie ma kredytu." });
  return row.mortgage;
}

export async function entriesOf(tx: Tx, mortgageIds: readonly string[]) {
  if (mortgageIds.length === 0) return [];
  return tx
    .select()
    .from(schema.mortgageEntry)
    .where(inArray(schema.mortgageEntry.mortgageId, [...mortgageIds]))
    .orderBy(desc(schema.mortgageEntry.date), desc(schema.mortgageEntry.seq));
}
