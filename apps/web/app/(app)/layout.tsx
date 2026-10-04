import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { requireHousehold } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, membership } = await requireHousehold();
  return (
    <>
      <AppHeader householdName={membership.householdName} user={user} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 sm:py-6">
        {children}
      </main>
    </>
  );
}
