import { planMonth } from "@pip/engine";
import { z } from "zod";
import { loadPlanContext } from "../plan-state";
import { currentMonth } from "../time";
import { householdProcedure, router } from "../trpc";

export const planRouter = router({
  preview: householdProcedure
    .input(z.object({ surplusMinor: z.bigint().min(0n).max(1_000_000_000_00n) }))
    .query(async ({ ctx, input }) => {
      const { state, labels } = await loadPlanContext(ctx.db, ctx.householdId, currentMonth());
      return { plan: planMonth(state, input.surplusMinor), labels };
    }),
});
