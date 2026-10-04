import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { householdRouter } from "./routers/household";
import { planRouter } from "./routers/plan";
import { router } from "./trpc";

export const appRouter = router({
  household: householdRouter,
  plan: planRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export { createContext } from "./trpc";
