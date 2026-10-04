"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-errors";

const MIN_PASSWORD = 12;

export function SignupForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!name.trim()) errors.name = "Podaj imię.";
    if (!email.trim()) errors.email = "Podaj adres e-mail.";
    if (password.length < MIN_PASSWORD) {
      errors.password = `Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`;
    }
    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) return;

    setPending(true);
    const { error } = await authClient.signUp.email({
      name: name.trim(),
      email: email.trim(),
      password,
    });
    if (error) {
      setFormError(authErrorMessage(error, "Nie udało się założyć konta."));
      setPending(false);
      return;
    }
    router.push("/setup");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <FieldGroup className="gap-6">
        <Field data-invalid={fieldErrors.name ? true : undefined}>
          <FieldLabel htmlFor="name">Imię</FieldLabel>
          <Input
            id="name"
            autoComplete="given-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={fieldErrors.name ? true : undefined}
          />
          <FieldError>{fieldErrors.name}</FieldError>
        </Field>
        <Field data-invalid={fieldErrors.email ? true : undefined}>
          <FieldLabel htmlFor="email">E-mail</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={fieldErrors.email ? true : undefined}
          />
          <FieldError>{fieldErrors.email}</FieldError>
        </Field>
        <Field data-invalid={fieldErrors.password ? true : undefined}>
          <FieldLabel htmlFor="password">Hasło</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={fieldErrors.password ? true : undefined}
          />
          <FieldDescription>Co najmniej {MIN_PASSWORD} znaków.</FieldDescription>
          <FieldError>{fieldErrors.password}</FieldError>
        </Field>
      </FieldGroup>
      {formError && (
        <Alert variant="destructive">
          <AlertTitle>{formError}</AlertTitle>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending && <Spinner />}
        Załóż konto
      </Button>
    </form>
  );
}
