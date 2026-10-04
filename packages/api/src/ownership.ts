import { type Db, schema } from "@pip/db";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";

/** The account if it belongs to the household; otherwise NOT_FOUND, so ids of others leak nothing. */
export async function householdAccount(db: Db, householdId: string, accountId: string) {
  const [row] = await db
    .select({ account: schema.account, person: schema.person })
    .from(schema.account)
    .innerJoin(schema.person, eq(schema.account.personId, schema.person.id))
    .where(and(eq(schema.account.id, accountId), eq(schema.person.householdId, householdId)))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Nie ma takiego konta." });
  return row;
}

export async function householdAccounts(db: Db, householdId: string) {
  return db
    .select({ account: schema.account, person: schema.person })
    .from(schema.account)
    .innerJoin(schema.person, eq(schema.account.personId, schema.person.id))
    .where(eq(schema.person.householdId, householdId));
}
