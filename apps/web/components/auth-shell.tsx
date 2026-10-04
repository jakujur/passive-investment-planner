import type { ReactNode } from "react";
import { Wordmark } from "@/components/wordmark";

export function AuthShell({
  title,
  lead,
  children,
}: {
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12 sm:px-6">
      <div className="flex w-full max-w-sm flex-col gap-10">
        <Wordmark size="lg" />
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl">{title}</h1>
          <p className="text-base text-muted-foreground">{lead}</p>
        </div>
        {children}
      </div>
    </main>
  );
}
