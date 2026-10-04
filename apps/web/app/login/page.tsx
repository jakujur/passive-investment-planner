import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { currentUser } from "@/lib/current-user";
import { serverApi } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function LoginPage() {
  const api = await serverApi();
  const { hasUsers } = await api.household.setupStatus();
  if (!hasUsers) redirect("/signup");
  if (await currentUser()) redirect("/");

  return (
    <AuthShell title="Zaloguj się" lead="Wróć do księgi swojego gospodarstwa.">
      <LoginForm />
    </AuthShell>
  );
}
