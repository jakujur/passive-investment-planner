import type { AssetClassKind } from "@pip/engine";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { PersonsCard } from "@/components/settings/persons-card";
import { PlanSettingsForm } from "@/components/settings/plan-settings-form";
import { type ClassWeight, WeightsForm } from "@/components/settings/weights-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CLASS_ORDER, CLASSES, classPath, wrapperTag } from "@/lib/classes";
import { serverApi } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Ustawienia planu" };

export default async function PlanSettingsPage() {
  const api = await serverApi();
  const [settings, accounts] = await Promise.all([api.settings.get(), api.accounts.list()]);
  const classWeight = (kind: AssetClassKind): ClassWeight => {
    const cls = settings.classes.find((c) => c.kind === kind);
    return { weightBp: cls?.targetWeightBp ?? 0, toleranceBp: cls?.toleranceBp ?? null };
  };
  const weights = {
    EQUITY: classWeight("EQUITY"),
    BONDS: classWeight("BONDS"),
    REAL_ESTATE: classWeight("REAL_ESTATE"),
    GOLD: classWeight("GOLD"),
  };
  const showPerson = settings.persons.length > 1;
  const investable = CLASS_ORDER.filter((kind) => kind !== "REAL_ESTATE");

  return (
    <>
      <PageHeader
        eyebrow="Plan"
        title="Ustawienia planu"
        lead="Wagi z tolerancją, rozkład na konta, wpłata, poduszka i osoby. Konta zarządzasz przy każdej klasie aktywów."
        actions={
          <Button variant="outline" size="sm" nativeButton={false} render={<Link href="/plan" />}>
            <ArrowLeft data-icon="inline-start" />
            Wróć do planu
          </Button>
        }
      />
      <WeightsForm initial={weights} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <PlanSettingsForm settings={settings} />
        <div className="flex flex-col gap-6">
          <PersonsCard persons={settings.persons} />
          <Card size="sm">
            <CardHeader>
              <CardTitle>Konta</CardTitle>
              <CardDescription>
                Podgląd wszystkich kont. Dodawanie, kolejność wpłat i edycja — na stronie klasy.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {investable.map((kind) => {
                const meta = CLASSES[kind];
                const own = accounts.filter((a) => a.assetKind === kind);
                return (
                  <div key={kind} className="flex flex-col gap-1">
                    <Link
                      href={classPath(kind)}
                      className="flex items-center gap-2 self-start text-xs font-semibold tracking-wide text-muted-foreground uppercase outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                    >
                      <span aria-hidden className={cn("size-2", meta.bg)} />
                      {meta.name}
                      <ArrowUpRight className="size-3.5" />
                    </Link>
                    {own.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Brak kont.</p>
                    ) : (
                      <ul className="border-t border-border">
                        {own.map((account) => (
                          <li
                            key={account.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-border py-1.5 text-sm"
                          >
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="truncate font-medium">{account.name}</span>
                              <Badge variant="secondary">
                                {wrapperTag(account.wrapper, account.ikzeEntrepreneur)}
                              </Badge>
                            </span>
                            <span className="text-muted-foreground">
                              {account.broker}
                              {showPerson ? ` · ${account.personName}` : ""}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
