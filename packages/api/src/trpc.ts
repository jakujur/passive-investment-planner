import { auth } from "@pip/auth";
import { db, schema } from "@pip/db";
import { initTRPC, TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import superjson from "superjson";

export async function createContext({ headers }: { headers: Headers }) {
  const session = await auth.api.getSession({ headers });
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.session.user } });
});

/** Every household-scoped query must filter by `ctx.householdId`. */
export const householdProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const [member] = await ctx.db
    .select()
    .from(schema.householdMember)
    .where(eq(schema.householdMember.userId, ctx.user.id))
    .limit(1);
  if (!member) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Najpierw załóż gospodarstwo." });
  }
  return next({ ctx: { ...ctx, householdId: member.householdId, role: member.role } });
});
