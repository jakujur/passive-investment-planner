import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { currentUser } from "@/lib/current-user";
import { serverApi } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Pierwsze konto" };

export default async function SignupPage() {
  const api = await serverApi();
  const { hasUsers } = await api.household.setupStatus();
  if (hasUsers) redirect("/login");
  if (await currentUser()) redirect("/");

  return (
    <AuthShell
      title="Załóż pierwsze konto"
      lead="Ta instancja jest jeszcze pusta. Pierwsze konto zostaje właścicielem gospodarstwa."
    >
      <SignupForm />
    </AuthShell>
  );
}
