import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import { ContributionsChart } from "@/components/charts/contributions-chart";
import { EditMonthDialog } from "@/components/edit-month-dialog";
import { PageHeader } from "@/components/page-header";
import { PlanLedger } from "@/components/plan-ledger";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { UndoMonthDialog } from "@/components/undo-month-dialog";
import {
  formatAdjustment,
  formatDayMonth,
  formatIsoDate,
  formatMonth,
  formatPln,
} from "@/lib/format";
import { requireHousehold, serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { user, membership } = await requireHousehold();
  const api = await serverApi();
  const history = await api.plan.history();
  const total = history.reduce((sum, row) => sum + row.surplusMinor, 0n);

  return (
    <>
      <PageHeader
        eyebrow="Profil"
        title={user.name}
        lead={`${user.email} · ${membership.householdName}`}
        actions={<SignOutButton />}
      />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Historia miesięcy</CardTitle>
          <CardDescription>
            {history.length === 0
              ? "Jeszcze żaden miesiąc nie został zaksięgowany."
              : `${history.length} ${history.length === 1 ? "zaksięgowany miesiąc" : history.length < 5 ? "zaksięgowane miesiące" : "zaksięgowanych miesięcy"} · łącznie ${formatPln(total)}. Rozwiń miesiąc, by zobaczyć przelewy.`}
          </CardDescription>
        </CardHeader>
        {history.length > 0 && (
          <CardContent className="flex flex-col gap-6">
            <ContributionsChart
              months={history.map((row) => ({ month: row.month, surplusMinor: row.surplusMinor }))}
            />
            <div className="border-t border-border">
              <div className="hidden grid-cols-[minmax(0,1fr)_7rem_7rem_6rem] gap-x-4 py-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
                <span>Miesiąc</span>
                <span className="text-right">Razem</span>
                <span className="text-right">Korekta</span>
                <span className="text-right">Zaksięgowano</span>
              </div>
              {history.map((row) => (
                <details key={row.id} className="group border-t border-border">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-0.5 py-2.5 text-sm outline-none select-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/30 sm:grid-cols-[minmax(0,1fr)_7rem_7rem_6rem] [&::-webkit-details-marker]:hidden">
                    <span className="flex items-center gap-2 font-medium">
                      <ChevronRight className="size-3.5 text-muted-foreground transition-transform group-open:rotate-90" />
                      {formatMonth(row.month)}
                    </span>
                    <span className="text-right font-medium tabular-nums">
                      {formatPln(row.surplusMinor)}
                    </span>
                    <span className="col-span-2 pl-5 text-xs text-muted-foreground tabular-nums sm:col-span-1 sm:pl-0 sm:text-right sm:text-sm">
                      {row.adjustmentMinor !== 0n ? formatAdjustment(row.adjustmentMinor) : "—"}
                      <span className="sm:hidden">
                        {" · "}
                        {row.executedAt ? formatDayMonth(row.executedAt) : "—"}
                      </span>
                    </span>
                    <span className="hidden text-right text-muted-foreground tabular-nums sm:block">
                      {row.executedAt ? formatDayMonth(row.executedAt) : "—"}
                    </span>
                  </summary>
                  <div className="flex flex-col gap-3 pb-4 pl-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="mr-auto text-xs text-muted-foreground">
                        Wykonano {formatIsoDate(row.date)}
                      </span>
                      <EditMonthDialog month={row} />
                      {row.canUndo && (
                        <UndoMonthDialog planId={row.id} month={row.month} size="xs" />
                      )}
                    </div>
                    <PlanLedger plan={row.plan} labels={row.labels} />
                  </div>
                </details>
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </>
  );
}
