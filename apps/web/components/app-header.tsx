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
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Wordmark />
          <span aria-hidden className="hidden h-6 w-px bg-border sm:block" />
          <span className="hidden truncate text-sm text-muted-foreground sm:block">
            {householdName}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden flex-col items-end leading-tight md:flex">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
