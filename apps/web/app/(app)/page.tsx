import {
  ClassCards,
  CushionCard,
  LimitsCard,
  PlanStatusCard,
  PortfolioHero,
} from "@/components/dashboard";
import { MarketStatusCard } from "@/components/market-status";
import { PageHeader } from "@/components/page-header";
import { formatMonth } from "@/lib/format";
import { requireHousehold, serverApi } from "@/lib/session";

export default async function DashboardPage() {
  const { membership } = await requireHousehold();
  const api = await serverApi();
  const [{ summary }, current, market] = await Promise.all([
    api.household.overview(),
    api.plan.current({ extraMinor: 0n }),
    api.market.status(),
  ]);
  const year = Number(current.month.slice(0, 4));

  return (
    <>
      <PageHeader
        eyebrow="Pulpit"
        title={membership.householdName}
        lead={`${formatMonth(current.month)} — majątek, klasy aktywów, poduszka i limity.`}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PortfolioHero classes={summary.classes} />
        <PlanStatusCard current={current} />
      </div>
      <ClassCards classes={summary.classes} />
      <div className="grid gap-6 lg:grid-cols-3">
        <CushionCard cushion={summary.cushion} />
        <LimitsCard limits={summary.limits} year={year} />
        <MarketStatusCard status={market} />
      </div>
    </>
  );
}
