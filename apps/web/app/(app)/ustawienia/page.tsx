import type { AssetClassKind } from "@pip/engine";
import type { Metadata } from "next";
import { MarketStatusCard } from "@/components/market-status";
import { PageHeader } from "@/components/page-header";
import { PersonForm } from "@/components/settings/persons-form";
import { PlanSettingsForm } from "@/components/settings/plan-settings-form";
import { WeightsForm } from "@/components/settings/weights-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { serverApi } from "@/lib/session";

export const metadata: Metadata = { title: "Ustawienia" };

const WRAPPER_LABEL: Record<string, string> = {
  IKE: "IKE",
  IKE_OBLIGACJE: "IKE-Obligacje",
  IKZE: "IKZE",
  IKZE_OBLIGACJE: "IKZE-Obligacje",
  REGULAR: "Zwykłe",
  CASH: "Gotówka",
};

export default async function SettingsPage() {
  const api = await serverApi();
  const [settings, market] = await Promise.all([api.settings.get(), api.market.status()]);
  const weightOf = (kind: AssetClassKind) =>
    settings.classes.find((c) => c.kind === kind)?.targetWeightBp ?? 0;
  const weights = {
    EQUITY: weightOf("EQUITY"),
    BONDS: weightOf("BONDS"),
    REAL_ESTATE: weightOf("REAL_ESTATE"),
    GOLD: weightOf("GOLD"),
  };

  return (
    <>
      <PageHeader
        eyebrow="Ustawienia"
        title="Gospodarstwo"
        lead="Wpłata, poduszka, wagi klas i osoby. Kolejki kont i instrumenty ustawisz przy każdej klasie."
      />
      <div className="grid gap-10 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col gap-10">
          <PlanSettingsForm settings={settings} />
          <WeightsForm initial={weights} />
        </div>
        <div className="flex flex-col gap-10">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Osoby</CardTitle>
              <CardDescription>
                Limity IKE i IKZE liczą się osobno dla każdej osoby.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-8">
              {settings.persons.map((person, index) => (
                <div key={person.id} className="flex flex-col gap-8">
                  {index > 0 && <Separator />}
                  <PersonForm
                    person={person}
                    ordinal={settings.persons.length > 1 ? index + 1 : null}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Konta</CardTitle>
              <CardDescription>
                Powstały z wybranego układu; kolejność wpłat ustawisz przy klasie.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {settings.persons.map((person) => (
                <div key={person.id} className="flex flex-col gap-2">
                  {settings.persons.length > 1 && (
                    <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      {person.name}
                    </span>
                  )}
                  <ul className="border-t border-border">
                    {person.accounts.map((account) => (
                      <li
                        key={account.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2 text-sm"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{account.name}</span>
                          <Badge variant="secondary">
                            {WRAPPER_LABEL[account.wrapper] ?? account.wrapper}
                          </Badge>
                        </span>
                        <span className="text-muted-foreground">
                          {account.broker} · {account.currency}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CardContent>
          </Card>

          <MarketStatusCard status={market} />
        </div>
      </div>
    </>
  );
}
