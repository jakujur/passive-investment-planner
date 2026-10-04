import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { currentSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Logowanie" };

export default async function LoginPage() {
  if (await currentSession()) redirect("/");

  return (
    <AuthShell
      title="Zaloguj się"
      lead="Wróć do księgi swojego gospodarstwa."
      footer={
        <>
          Nie masz konta?{" "}
          <Link href="/signup" className="font-medium text-primary underline underline-offset-4">
            Załóż je
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
