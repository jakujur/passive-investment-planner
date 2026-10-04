import "server-only";
import { appRouter, createContext } from "@pip/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const requestContext = cache(async () => createContext({ headers: await headers() }));

/** Server-side tRPC caller bound to the current request's cookies. */
export const serverApi = cache(async () => appRouter.createCaller(await requestContext()));

/** Signed-in user and their household membership; without a session goes to /login (or /signup on a fresh instance). */
export const requireUser = cache(async () => {
  const api = await serverApi();
  if (!(await requestContext()).session) {
    const { hasUsers } = await api.household.setupStatus();
    redirect(hasUsers ? "/login" : "/signup");
  }
  return api.household.me();
});

/** Like `requireUser`, but also sends users without a household to the setup wizard. */
export async function requireHousehold() {
  const me = await requireUser();
  if (!me.membership) redirect("/setup");
  return { ...me, membership: me.membership };
}
