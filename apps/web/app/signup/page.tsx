import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { currentSession } from "@/lib/session";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Rejestracja" };

export default async function SignupPage() {
  if (await currentSession()) redirect("/");

  return (
    <AuthShell
      title="Załóż konto"
      lead="Po rejestracji ustawisz własne gospodarstwo: układ kont, osoby i poduszkę."
      footer={
        <>
          Masz już konto?{" "}
          <Link href="/login" className="font-medium text-primary underline underline-offset-4">
            Zaloguj się
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthShell>
  );
}
