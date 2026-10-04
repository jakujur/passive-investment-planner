import Link from "next/link";
import { MainNav, MobileNav } from "@/components/main-nav";
import { SignOutButton } from "@/components/sign-out-button";
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
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav householdName={householdName} />
            <Link href="/" className="outline-none focus-visible:ring-2 focus-visible:ring-ring/30">
              <Wordmark />
            </Link>
            <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
            <span className="hidden truncate text-sm text-muted-foreground sm:block">
              {householdName}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden flex-col items-end leading-tight lg:flex">
              <span className="text-sm font-medium">{user.name}</span>
              <span className="text-xs text-muted-foreground">{user.email}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
        <MainNav />
      </div>
    </header>
  );
}
