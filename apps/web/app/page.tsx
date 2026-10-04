import { AppHeader } from "@/components/app-header";
import { Overview } from "@/components/overview";
import { PlanPanel } from "@/components/plan-panel";
import { requireHousehold, serverApi } from "@/lib/session";

const monthFormatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });

export default async function PlanPage() {
  const { user, membership } = await requireHousehold();
  const api = await serverApi();
  const { summary } = await api.household.overview();
  const now = new Date();
  const month = monthFormatter.format(now);
  const monthCapitalized = month.charAt(0).toLocaleUpperCase("pl-PL") + month.slice(1);

  return (
    <>
      <AppHeader householdName={membership.householdName} user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6 sm:py-12">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl">{membership.householdName}</h1>
          <p className="text-base text-muted-foreground">
            {monthCapitalized} — poduszka, portfel i limity, a pod nimi plan miesiąca.
          </p>
        </div>
        <Overview summary={summary} year={now.getFullYear()} />
        <PlanPanel monthLabel={month} />
      </main>
    </>
  );
}
