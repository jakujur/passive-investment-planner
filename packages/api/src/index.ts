import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { assetsRouter } from "./routers/assets";
import { householdRouter } from "./routers/household";
import { instrumentsRouter } from "./routers/instruments";
import { marketRouter } from "./routers/market";
import { planRouter } from "./routers/plan";
import { realEstateRouter } from "./routers/real-estate";
import { settingsRouter } from "./routers/settings";
import { transactionsRouter } from "./routers/transactions";
import { router } from "./trpc";

export const appRouter = router({
  household: householdRouter,
  plan: planRouter,
  settings: settingsRouter,
  assets: assetsRouter,
  transactions: transactionsRouter,
  instruments: instrumentsRouter,
  realEstate: realEstateRouter,
  market: marketRouter,
});

export type AppRouter = typeof appRouter;
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
export { createContext } from "./trpc";
