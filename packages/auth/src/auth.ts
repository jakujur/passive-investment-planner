import { db, schema } from "@pip/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { and, count, eq, gt, isNull } from "drizzle-orm";

/**
 * Registration is closed: the very first user bootstraps the instance,
 * everyone else needs a pending, unexpired invite for their e-mail.
 */
async function canRegister(email: string): Promise<boolean> {
  const [users] = await db.select({ total: count() }).from(schema.user);
  if ((users?.total ?? 0) === 0) return true;
  const [invite] = await db
    .select({ id: schema.householdInvite.id })
    .from(schema.householdInvite)
    .where(
      and(
        eq(schema.householdInvite.email, email.toLowerCase()),
        isNull(schema.householdInvite.acceptedAt),
        gt(schema.householdInvite.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return invite !== undefined;
}

export const auth = betterAuth({
  appName: "Tracker inwestycji",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  account: { modelName: "authAccount" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  rateLimit: { enabled: true },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await canRegister(user.email))) {
            throw new APIError("FORBIDDEN", { message: "Rejestracja wymaga zaproszenia." });
          }
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
