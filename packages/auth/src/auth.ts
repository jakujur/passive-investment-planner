import { db, schema } from "@pip/db";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

/**
 * Open e-mail + password registration: every new user sets up their own household,
 * and all data access is scoped to that household in the tRPC layer.
 */
export const auth = betterAuth({
  appName: "Tracker inwestycji",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  account: { modelName: "authAccount" },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
  },
  rateLimit: { enabled: true },
});

export type Session = typeof auth.$Infer.Session;
