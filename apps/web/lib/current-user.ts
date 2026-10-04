import "server-only";
import { serverApi } from "./session";

// pnpm installs two @trpc/server copies (different typescript peers), so `instanceof TRPCError` fails.
function isUnauthorized(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.name === "TRPCError" &&
    "code" in error &&
    error.code === "UNAUTHORIZED"
  );
}

/** Signed-in user or `null`; unlike `requireUser` it never redirects, so public pages can use it. */
export async function currentUser() {
  const api = await serverApi();
  try {
    return await api.household.me();
  } catch (error) {
    if (isUnauthorized(error)) return null;
    throw error;
  }
}
