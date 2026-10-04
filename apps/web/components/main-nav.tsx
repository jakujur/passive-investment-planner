"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/", label: "Pulpit" },
  { href: "/plan", label: "Plan" },
  { href: "/akcje", label: "Akcje" },
  { href: "/obligacje", label: "Obligacje" },
  { href: "/nieruchomosci", label: "Nieruchomości" },
  { href: "/zloto", label: "Złoto" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MainNav({ className }: { className?: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Główna" className={cn("hidden self-stretch md:block", className)}>
      <ul className="flex h-full items-stretch gap-1">
        {NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex items-center border-b-2 px-2.5 text-xs font-semibold tracking-wide uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                  active
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function MobileNav({ householdName }: { householdName: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const items = [...NAV_ITEMS, { href: "/profil", label: "Profil" }] as const;
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="outline" size="icon-sm" aria-label="Otwórz menu" />}
        className="md:hidden"
      >
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-72">
        <SheetHeader>
          <SheetTitle>{householdName}</SheetTitle>
        </SheetHeader>
        <nav aria-label="Główna" className="px-2">
          <ul className="flex flex-col">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex h-11 items-center border-l-2 px-4 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                      active
                        ? "border-primary bg-accent text-accent-foreground"
                        : "border-transparent text-foreground hover:bg-muted",
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
