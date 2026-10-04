import { CircleUserRound } from "lucide-react";
import Link from "next/link";
import { MainNav, MobileNav } from "@/components/main-nav";
import { Wordmark } from "@/components/wordmark";

export function AppHeader({
  householdName,
  user,
}: {
  householdName: string;
  user: { name: string; email: string };
}) {
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex h-12 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <MobileNav householdName={householdName} />
          <Link
            href="/"
            className="shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <Wordmark />
          </Link>
          <span aria-hidden className="hidden h-5 w-px bg-border lg:block" />
          <span className="hidden truncate text-sm text-muted-foreground lg:block">
            {householdName}
          </span>
        </div>
        <MainNav className="ml-2" />
        <Link
          href="/profil"
          aria-label={`Profil: ${user.name}`}
          className="ml-auto flex h-8 min-w-0 items-center gap-2 px-2 text-sm font-medium transition-colors outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          <CircleUserRound className="size-4 shrink-0 text-muted-foreground" />
          <span className="hidden truncate sm:inline">{user.name}</span>
        </Link>
      </div>
    </header>
  );
}
