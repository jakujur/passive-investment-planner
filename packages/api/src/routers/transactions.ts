import { type Db, schema, type Tx } from "@pip/db";
import { parseQuantity, QUANTITY_DIGITS, wrapperFamily } from "@pip/engine";
import { type Currency, divRound } from "@pip/money";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, lte, or } from "drizzle-orm";
import { z } from "zod";
import {
  BOND_NAMES,
  type BondTicker,
  bondPurchaseDate,
  bondSeries,
  parseBondSeries,
} from "../bonds";
import { householdAccount, householdAccounts } from "../ownership";
import { BOND_NOMINAL_MINOR } from "../plan-state";
import { today } from "../time";
import { householdProcedure, router } from "../trpc";

const isoDate = z.iso.date();

export const transactionsRouter = router({
  list: householdProcedure
    .input(
      z.object({
        assetKind: z.enum(["EQUITY", "BONDS", "GOLD"]).optional(),
        accountId: z.uuid().optional(),
        limit: z.int().min(1).max(500).default(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      const accounts = await householdAccounts(ctx.db, ctx.householdId);
      const accountIds = accounts.map((a) => a.account.id);
      if (accountIds.length === 0) return [];
      const rows = await ctx.db
        .select({ tx: schema.transaction, instrument: schema.instrument })
        .from(schema.transaction)
        .leftJoin(schema.instrument, eq(schema.transaction.instrumentId, schema.instrument.id))
        .where(
          and(
            inArray(schema.transaction.accountId, accountIds),
            input.accountId ? eq(schema.transaction.accountId, input.accountId) : undefined,
            // A class lists its purchases plus the deposits into its accounts (they use the limits).
            input.assetKind
              ? or(
                  eq(schema.instrument.assetKind, input.assetKind),
                  inArray(
                    schema.transaction.accountId,
                    accounts
                      .filter((a) => a.account.assetKind === input.assetKind)
                      .map((a) => a.account.id),
                  ),
                )
              : undefined,
          ),
        )
        .orderBy(desc(schema.transaction.date), desc(schema.transaction.createdAt))
        .limit(input.limit);
      return rows.map(({ tx, instrument }) => {
        const owner = accounts.find((a) => a.account.id === tx.accountId);
        return {
          id: tx.id,
          date: tx.date,
          type: tx.type,
          source: tx.source,
          quantity: tx.quantity,
          amountMinor: tx.amountMinor,
          currency: owner?.account.currency ?? "PLN",
          accountId: tx.accountId,
          accountName: owner?.account.name ?? "",
          personName: owner?.person.name ?? "",
          instrumentName: instrument?.name ?? null,
          instrumentTicker: instrument?.ticker ?? null,
        };
      });
    }),

  /** Manual, possibly backdated entry. A BUY can carry its deposit, which counts toward IKE/IKZE limits. */
  create: householdProcedure
    .input(
      z
        .object({
          accountId: z.uuid(),
          type: z.enum(["BUY", "DEPOSIT", "FEE", "INTEREST"]),
          date: isoDate,
          instrumentId: z.uuid().nullable(),
          quantity: z
            .string()
            .regex(/^\d+(\.\d{1,8})?$/)
            .nullable(),
          amountMinor: z.bigint().min(1n).max(1_000_000_000_00n),
          alsoDeposit: z.boolean().default(false),
        })
        .refine((t) => t.type !== "BUY" || (t.instrumentId !== null && t.quantity !== null), {
          message: "Zakup wymaga instrumentu i ilości.",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await householdAccount(ctx.db, ctx.householdId, input.accountId);
      const [instrument] = input.instrumentId
        ? await ctx.db
            .select()
            .from(schema.instrument)
            .where(eq(schema.instrument.id, input.instrumentId))
        : [];
      if (input.instrumentId && !instrument) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego instrumentu." });
      }
      if (instrument?.type === "BOND" && !/^\d+$/.test(input.quantity ?? "")) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Obligacje kupuje się w całych sztukach.",
        });
      }

      let fxRate: bigint | null = null;
      if (account.currency !== "PLN") {
        const [rate] = await ctx.db
          .select({ rate: schema.fxRate.rate })
          .from(schema.fxRate)
          .where(
            and(eq(schema.fxRate.currency, account.currency), lte(schema.fxRate.date, input.date)),
          )
          .orderBy(desc(schema.fxRate.date))
          .limit(1);
        if (!rate) {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: `Brak kursu NBP ${account.currency} na ${input.date} — odśwież notowania.`,
          });
        }
        fxRate = rate.rate;
      }

      await ctx.db.transaction(async (tx) => {
        const base = { accountId: account.id, date: input.date, source: "MANUAL" as const };
        if (input.type === "BUY" && input.alsoDeposit) {
          await tx
            .insert(schema.transaction)
            .values({ ...base, type: "DEPOSIT", amountMinor: input.amountMinor });
        }
        const [row] = await tx
          .insert(schema.transaction)
          .values({
            ...base,
            type: input.type,
            instrumentId: input.type === "BUY" ? input.instrumentId : null,
            quantity: input.type === "BUY" ? input.quantity : null,
            amountMinor: input.type === "FEE" ? -input.amountMinor : input.amountMinor,
            fxRate: input.type === "BUY" ? fxRate : null,
          })
          .returning({ id: schema.transaction.id });
        if (row && input.type === "BUY" && instrument?.type === "BOND" && instrument.ticker) {
          await tx.insert(schema.bondLot).values({
            accountId: account.id,
            transactionId: row.id,
            series: bondSeries(instrument.ticker, input.date),
            purchaseDate: input.date,
            units: Number(input.quantity),
          });
        }
      });
    }),

  /**
   * Current holding without its history: quantity and average purchase price as of a date.
   * Optional deposits made this year count toward the IKE/IKZE limit.
   */
  addPosition: householdProcedure
    .input(
      z.object({
        accountId: z.uuid(),
        instrumentId: z.uuid(),
        date: isoDate,
        quantity: z.string().regex(/^\d+(\.\d{1,8})?$/),
        /** Average price per unit (or gram) in the account currency. */
        averagePriceMinor: z.bigint().min(1n).max(1_000_000_000_00n),
        depositsThisYearMinor: z.bigint().min(0n).max(1_000_000_000_00n).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await householdAccount(ctx.db, ctx.householdId, input.accountId);
      const [instrument] = await ctx.db
        .select()
        .from(schema.instrument)
        .where(eq(schema.instrument.id, input.instrumentId));
      if (!instrument || instrument.assetKind !== account.assetKind || instrument.type === "BOND") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ten instrument nie pasuje do konta.",
        });
      }
      const quantityScaled = parseQuantity(input.quantity);
      if (quantityScaled === 0n) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ilość musi być większa od zera." });
      }
      const costMinor = divRound(
        quantityScaled * input.averagePriceMinor,
        10n ** BigInt(QUANTITY_DIGITS),
      );
      const fxRate = await rateOn(ctx.db, account.currency, input.date);
      const year = today().slice(0, 4);
      await ctx.db.transaction(async (tx) => {
        await tx.insert(schema.transaction).values({
          accountId: account.id,
          instrumentId: instrument.id,
          date: input.date,
          type: "BUY",
          quantity: input.quantity,
          amountMinor: costMinor,
          fxRate,
          source: "OPENING",
        });
        if (input.depositsThisYearMinor && input.depositsThisYearMinor > 0n) {
          await tx.insert(schema.transaction).values({
            accountId: account.id,
            date: input.date.startsWith(year) ? input.date : `${year}-01-01`,
            type: "DEPOSIT",
            amountMinor: input.depositsThisYearMinor,
            source: "OPENING",
          });
        }
      });
    }),

  /**
   * Bond holdings typed like the bond service statement: series code and count per row. The
   * purchase date follows from the maturity date; purchases made this year in IKE/IKZE count
   * toward the limit.
   */
  addBonds: householdProcedure
    .input(
      z.object({
        accountId: z.uuid(),
        rows: z
          .array(
            z.object({
              series: z.string().trim().min(7).max(7),
              units: z.int().min(1).max(1_000_000),
              /** Exact redemption day from the statement; defaults to the 1st of the maturity month. */
              maturityDate: isoDate.nullable(),
            }),
          )
          .min(1)
          .max(200),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await householdAccount(ctx.db, ctx.householdId, input.accountId);
      if (account.assetKind !== "BONDS") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "To nie jest konto obligacji." });
      }
      const date = today();
      const rows = input.rows.map((row, index) => {
        const parsed = parseBondSeries(row.series);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Wiersz ${index + 1}: „${row.series}” nie jest kodem emisji (np. EDO1036, ROD0338).`,
          });
        }
        const maturityDate = row.maturityDate ?? `${parsed.maturityMonth}-01`;
        if (!maturityDate.startsWith(parsed.maturityMonth)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Wiersz ${index + 1}: data wykupu nie zgadza się z emisją ${row.series}.`,
          });
        }
        if (maturityDate <= date) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Wiersz ${index + 1}: emisja ${row.series} jest już wykupiona.`,
          });
        }
        return {
          ...row,
          series: row.series.trim().toUpperCase(),
          ticker: parsed.ticker,
          purchaseDate: bondPurchaseDate(parsed.ticker, maturityDate),
        };
      });
      const taxAccount = wrapperFamily(account.wrapper) !== null;
      await ctx.db.transaction(async (tx) => {
        for (const row of rows) {
          const instrumentId = await ensureBondInstrument(tx, row.ticker);
          const amountMinor = BigInt(row.units) * BOND_NOMINAL_MINOR;
          if (taxAccount && row.purchaseDate.startsWith(date.slice(0, 4))) {
            await tx.insert(schema.transaction).values({
              accountId: account.id,
              date: row.purchaseDate,
              type: "DEPOSIT",
              amountMinor,
              source: "OPENING",
            });
          }
          const [buy] = await tx
            .insert(schema.transaction)
            .values({
              accountId: account.id,
              instrumentId,
              date: row.purchaseDate,
              type: "BUY",
              quantity: String(row.units),
              amountMinor,
              source: "OPENING",
            })
            .returning({ id: schema.transaction.id });
          if (!buy) throw new Error("Bond purchase insert returned nothing");
          await tx.insert(schema.bondLot).values({
            accountId: account.id,
            transactionId: buy.id,
            series: row.series,
            purchaseDate: row.purchaseDate,
            units: row.units,
          });
        }
      });
      return { added: rows.length };
    }),

  /** Only manual entries and opening balances; booked plans are corrected in the month ledger. */
  delete: householdProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const [row] = await ctx.db
      .select({ accountId: schema.transaction.accountId, source: schema.transaction.source })
      .from(schema.transaction)
      .where(eq(schema.transaction.id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej transakcji." });
    await householdAccount(ctx.db, ctx.householdId, row.accountId);
    if (row.source !== "MANUAL" && row.source !== "OPENING") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Transakcje z planu poprawia się w historii miesięcy.",
      });
    }
    await ctx.db.delete(schema.transaction).where(eq(schema.transaction.id, input.id));
  }),
});

/** NBP rate valid on `date` for a foreign-currency account; `null` for PLN. */
async function rateOn(db: Db, currency: Currency, date: string): Promise<bigint | null> {
  if (currency === "PLN") return null;
  const [rate] = await db
    .select({ rate: schema.fxRate.rate })
    .from(schema.fxRate)
    .where(and(eq(schema.fxRate.currency, currency), lte(schema.fxRate.date, date)))
    .orderBy(desc(schema.fxRate.date))
    .limit(1);
  if (!rate) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `Brak kursu NBP ${currency} na ${date}.`,
    });
  }
  return rate.rate;
}

/** Bond instruments are shared; a series type typed for the first time gets its instrument. */
async function ensureBondInstrument(tx: Tx, ticker: BondTicker): Promise<string> {
  const [existing] = await tx
    .select({ id: schema.instrument.id })
    .from(schema.instrument)
    .where(and(eq(schema.instrument.type, "BOND"), eq(schema.instrument.ticker, ticker)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await tx
    .insert(schema.instrument)
    .values({
      ticker,
      name: BOND_NAMES[ticker],
      type: "BOND",
      assetKind: "BONDS",
      currency: "PLN",
    })
    .returning({ id: schema.instrument.id });
  if (!created) throw new Error("Bond instrument insert returned nothing");
  return created.id;
}
