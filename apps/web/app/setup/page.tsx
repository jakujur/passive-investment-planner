import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/wordmark";
import { requireUser, serverApi } from "@/lib/session";
import { SetupWizard } from "./setup-wizard";

export const metadata: Metadata = { title: "Ustawienie gospodarstwa" };

export default async function SetupPage() {
  const me = await requireUser();
  if (me.membership) redirect("/");
  const api = await serverApi();
  const layouts = await api.household.layouts();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-16">
      <header className="flex flex-col gap-8">
        <Wordmark />
        <div className="flex flex-col gap-3">
          <h1 className="font-heading text-3xl">Ustaw gospodarstwo</h1>
          <p className="max-w-prose text-base text-muted-foreground">
            Jedno podejście: nazwa, układ kont, osoby i poduszka. Konta i kolejki wpłat powstaną
            automatycznie z wybranego układu.
          </p>
        </div>
      </header>
      <SetupWizard layouts={layouts} userName={me.user.name} />
    </main>
  );
}
