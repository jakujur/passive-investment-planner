import type { Metadata } from "next";
import { PlanView } from "@/components/plan-view";
import { serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Plan miesiąca" };

export default async function PlanPage() {
  const api = await serverApi();
  const current = await api.plan.current({ adjustmentMinor: 0n });
  return <PlanView initial={current} />;
}
