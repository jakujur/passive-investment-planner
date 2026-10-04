import "server-only";
import { currentSession, serverApi } from "./session";

/** Signed-in user or `null`; unlike `requireUser` it never redirects, so public pages can use it. */
export async function currentUser() {
  if (!(await currentSession())) return null;
  const api = await serverApi();
  return api.household.me();
}
