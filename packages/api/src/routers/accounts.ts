import { schema } from "@pip/db";
import { type Wrapper, wrapperFamily } from "@pip/engine";
import { TRPCError } from "@trpc/server";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { householdAccount, householdAccounts } from "../ownership";
import { householdProcedure, router } from "../trpc";

/** Which account types and platforms each investable class offers. */
export const ACCOUNT_OPTIONS = {
  EQUITY: { wrappers: ["IKE", "IKZE", "REGULAR"], brokers: ["XTB", "mBank eMakler", "Bossa"] },
  GOLD: {
    wrappers: ["IKE", "IKZE", "REGULAR"],
    brokers: ["XTB", "mBank eMakler", "Bossa", "BullionVault"],
  },
  BONDS: { wrappers: ["IKE_OBLIGACJE", "IKZE_OBLIGACJE", "REGULAR"], brokers: ["PKO BP"] },
} as const;

const investKind = z.enum(["EQUITY", "BONDS", "GOLD"]);
const wrapperInput = z.enum(["IKE", "IKE_OBLIGACJE", "IKZE", "IKZE_OBLIGACJE", "REGULAR"]);

const WRAPPER_LABEL: Record<z.infer<typeof wrapperInput>, string> = {
  IKE: "IKE",
  IKE_OBLIGACJE: "IKE-Obligacje",
  IKZE: "IKZE",
  IKZE_OBLIGACJE: "IKZE-Obligacje",
  REGULAR: "Rachunek zwykły",
};

export const accountsRouter = router({
  options: householdProcedure.query(() => ACCOUNT_OPTIONS),

  /**
   * Adds an account to an asset class and its fill queue: tax wrappers go before the
   * regular accounts (IKE before IKZE), regular accounts at the end.
   */
  create: householdProcedure
    .input(
      z.object({
        assetKind: investKind,
        wrapper: wrapperInput,
        broker: z.string().trim().min(1),
        personId: z.uuid().nullable(),
        ikzeEntrepreneur: z.boolean().default(false),
        name: z.string().trim().max(80).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const options = ACCOUNT_OPTIONS[input.assetKind];
      if (!options.wrappers.some((w) => w === input.wrapper)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${WRAPPER_LABEL[input.wrapper]} nie pasuje do tej klasy aktywów.`,
        });
      }
      if (!options.brokers.some((b) => b === input.broker)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nieobsługiwana platforma: ${input.broker}.`,
        });
      }
      if (input.broker === "BullionVault" && input.wrapper !== "REGULAR") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "BullionVault nie prowadzi IKE ani IKZE.",
        });
      }

      const persons = await ctx.db
        .select({ id: schema.person.id, name: schema.person.name })
        .from(schema.person)
        .where(eq(schema.person.householdId, ctx.householdId))
        .orderBy(asc(schema.person.createdAt));
      const owner = input.personId
        ? persons.find((p) => p.id === input.personId)
        : persons.length === 1
          ? persons[0]
          : undefined;
      if (!owner) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: input.personId ? "Nie ma takiej osoby." : "Wybierz, czyje to konto.",
        });
      }

      const family = wrapperFamily(input.wrapper);
      if (family) {
        const [taken] = await ctx.db
          .select({ name: schema.account.name })
          .from(schema.account)
          .where(
            and(eq(schema.account.personId, owner.id), eq(schema.account.wrapperFamily, family)),
          )
          .limit(1);
        if (taken) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `${owner.name} ma już ${family} („${taken.name}”). Każda osoba może mieć jedno ${family} — także w wersji Obligacje. Dodaj kolejną osobę w ustawieniach planu.`,
          });
        }
      }

      const name = input.name || WRAPPER_LABEL[input.wrapper];
      return ctx.db.transaction(async (tx) => {
        const [account] = await tx
          .insert(schema.account)
          .values({
            personId: owner.id,
            name,
            broker: input.broker,
            wrapper: input.wrapper,
            currency: "PLN",
            assetKind: input.assetKind,
            ikzeEntrepreneur: family === "IKZE" && input.ikzeEntrepreneur,
          })
          .returning({ id: schema.account.id, wrapper: schema.account.wrapper });
        if (!account) throw new Error("Account insert returned nothing");

        const [cls] = await tx
          .select({ id: schema.assetClass.id, queue: schema.assetClass.accountQueue })
          .from(schema.assetClass)
          .where(
            and(
              eq(schema.assetClass.householdId, ctx.householdId),
              eq(schema.assetClass.kind, input.assetKind),
            ),
          );
        if (!cls)
          throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiej klasy aktywów." });
        const queued = cls.queue.length
          ? await tx
              .select({ id: schema.account.id, wrapper: schema.account.wrapper })
              .from(schema.account)
              .where(inArray(schema.account.id, cls.queue))
          : [];
        const rank = (wrapper: Wrapper) => {
          const accountFamily = wrapperFamily(wrapper);
          return accountFamily === "IKE" ? 0 : accountFamily === "IKZE" ? 1 : 2;
        };
        const wrapperOf = new Map(queued.map((a) => [a.id, a.wrapper]));
        const position = cls.queue.findIndex(
          (id) => rank(wrapperOf.get(id) ?? "REGULAR") > rank(account.wrapper),
        );
        const queue = [...cls.queue];
        queue.splice(position === -1 ? queue.length : position, 0, account.id);
        await tx
          .update(schema.assetClass)
          .set({ accountQueue: queue })
          .where(eq(schema.assetClass.id, cls.id));
        return { id: account.id };
      });
    }),

  update: householdProcedure
    .input(
      z.object({
        id: z.uuid(),
        name: z.string().trim().min(1).max(80),
        broker: z.string().trim().min(1),
        ikzeEntrepreneur: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { account } = await householdAccount(ctx.db, ctx.householdId, input.id);
      const kind = account.assetKind;
      const brokers: readonly string[] =
        kind === null || kind === "REAL_ESTATE" ? [] : ACCOUNT_OPTIONS[kind].brokers;
      if (kind && !brokers.includes(input.broker)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Nieobsługiwana platforma: ${input.broker}.`,
        });
      }
      await ctx.db
        .update(schema.account)
        .set({
          name: input.name,
          broker: input.broker,
          ikzeEntrepreneur: wrapperFamily(account.wrapper) === "IKZE" && input.ikzeEntrepreneur,
        })
        .where(eq(schema.account.id, account.id));
    }),

  /** Only accounts without history; cushion and down-payment accounts are managed elsewhere. */
  delete: householdProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const { account } = await householdAccount(ctx.db, ctx.householdId, input.id);
    if (!account.assetKind) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Konta poduszki i wkładu własnego nie usuwa się z tego miejsca.",
      });
    }
    const [used] = await ctx.db
      .select({ total: count() })
      .from(schema.transaction)
      .where(eq(schema.transaction.accountId, account.id));
    if ((used?.total ?? 0) > 0) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Konto ma już transakcje — nie można go usunąć.",
      });
    }
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(schema.assetClass)
        .set({
          accountQueue: sql`array_remove(${schema.assetClass.accountQueue}, ${account.id}::uuid)`,
        })
        .where(
          and(
            eq(schema.assetClass.householdId, ctx.householdId),
            sql`${account.id}::uuid = any(${schema.assetClass.accountQueue})`,
          ),
        );
      await tx.delete(schema.account).where(eq(schema.account.id, account.id));
    });
  }),

  /** All household accounts, for the plan settings overview. */
  list: householdProcedure.query(async ({ ctx }) =>
    (await householdAccounts(ctx.db, ctx.householdId)).map(({ account, person }) => ({
      id: account.id,
      name: account.name,
      broker: account.broker,
      wrapper: account.wrapper,
      assetKind: account.assetKind,
      ikzeEntrepreneur: account.ikzeEntrepreneur,
      personId: person.id,
      personName: person.name,
    })),
  ),
});
