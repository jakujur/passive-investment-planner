import type { Metadata } from "next";
import { PlanView } from "@/components/plan-view";
import { serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Plan miesiąca" };

export default async function PlanPage() {
  const api = await serverApi();
  const [current, history] = await Promise.all([
    api.plan.current({ extraMinor: 0n }),
    api.plan.history(),
  ]);
  return <PlanView initial={current} history={history} />;
}
