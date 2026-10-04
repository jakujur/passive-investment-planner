import type { AssetClassKind } from "@pip/engine";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import {
  AddEtfForm,
  ClassSettingsForm,
  type QueueAccount,
} from "@/components/assets/class-settings-form";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { CLASSES, classPath } from "@/lib/classes";
import { serverApi } from "@/lib/session";

export async function ClassSettingsPage({ kind }: { kind: AssetClassKind }) {
  const api = await serverApi();
  const [overview, settings, household, instruments] = await Promise.all([
    api.assets.overview({ kind }),
    api.settings.get(),
    api.household.overview(),
    kind === "REAL_ESTATE" ? Promise.resolve([]) : api.instruments.list({ assetKind: kind }),
  ]);
  const limits = new Map(household.summary.limits.map((l) => [l.accountId, l]));
  const accounts: QueueAccount[] = settings.persons.flatMap((p) =>
    p.accounts
      .filter((a) => a.wrapper !== "CASH")
      .map((a) => {
        const limit = limits.get(a.id);
        return {
          id: a.id,
          name: a.name,
          broker: a.broker,
          wrapper: a.wrapper,
          personName: p.name,
          limit: limit ? { limitMinor: limit.limitMinor, usedMinor: limit.usedMinor } : null,
        };
      }),
  );

  return (
    <>
      <PageHeader
        eyebrow="Ustawienia klasy"
        title={CLASSES[kind].name}
        lead="Kolejność kont, instrumenty i pasmo, w którym klasa może odchylić się od wagi."
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={classPath(kind)} />}
          >
            <ArrowLeft data-icon="inline-start" />
            Wróć do klasy
          </Button>
        }
      />
      <ClassSettingsForm
        kind={kind}
        name={overview.name}
        targetWeightBp={overview.targetWeightBp}
        bandAbsBp={overview.bandAbsBp}
        bandRelBp={overview.bandRelBp}
        initialQueue={overview.queue.map((a) => a.id)}
        purchaseInstrumentId={overview.purchaseInstrument?.id ?? null}
        benchmarkInstrumentId={overview.benchmarkInstrument?.id ?? null}
        accounts={accounts}
        instruments={instruments}
      />
      {kind === "EQUITY" && <AddEtfForm />}
    </>
  );
}
