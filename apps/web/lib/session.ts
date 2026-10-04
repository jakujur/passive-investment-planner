import "server-only";
import { appRouter, createContext } from "@pip/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

const requestContext = cache(async () => createContext({ headers: await headers() }));

/** Server-side tRPC caller bound to the current request's cookies. */
export const serverApi = cache(async () => appRouter.createCaller(await requestContext()));

/** Better Auth session of the current request, or `null`; never calls a protected procedure. */
export const currentSession = cache(async () => (await requestContext()).session);

/** Signed-in user and their household membership; without a session goes to /login. */
export const requireUser = cache(async () => {
  if (!(await currentSession())) redirect("/login");
  const api = await serverApi();
  return api.household.me();
});

/** Like `requireUser`, but also sends users without a household to the setup wizard. */
export async function requireHousehold() {
  const me = await requireUser();
  if (!me.membership) redirect("/setup");
  return { ...me, membership: me.membership };
}
