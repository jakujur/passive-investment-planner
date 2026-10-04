"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={signOut}
      disabled={pending}
      className="max-sm:px-2.5 max-sm:has-data-[icon=inline-start]:pl-2.5"
    >
      {pending ? <Spinner /> : <LogOut data-icon="inline-start" />}
      <span className="max-sm:sr-only">Wyloguj</span>
    </Button>
  );
}
