"use client";

import type { RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/lib/trpc";

type Person = RouterOutputs["settings"]["get"]["persons"][number];

export function PersonForm({ person, ordinal }: { person: Person; ordinal: number | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState(person.name);
  const [isEntrepreneur, setIsEntrepreneur] = useState(person.isEntrepreneur);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const update = useMutation(
    trpc.settings.updatePerson.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    }),
  );
  const dirty = name.trim() !== person.name || isEntrepreneur !== person.isEntrepreneur;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Podaj imię.");
      return;
    }
    setError(null);
    update.mutate({ id: person.id, name: name.trim(), isEntrepreneur });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      {ordinal !== null && (
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Osoba {ordinal}
        </span>
      )}
      <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field data-invalid={error ? true : undefined}>
          <FieldLabel htmlFor={`person-${person.id}-name`}>Imię</FieldLabel>
          <Input
            id={`person-${person.id}-name`}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
            }}
            aria-invalid={error ? true : undefined}
          />
          <FieldError>{error}</FieldError>
        </Field>
        <div className="flex items-center gap-4">
          {saved && !update.isPending && (
            <span role="status" className="text-sm text-primary">
              Zapisano.
            </span>
          )}
          <Button type="submit" variant="secondary" disabled={update.isPending || !dirty}>
            {update.isPending && <Spinner />}
            Zapisz
          </Button>
        </div>
      </div>
      <Field orientation="horizontal">
        <Checkbox
          id={`person-${person.id}-entrepreneur`}
          checked={isEntrepreneur}
          onCheckedChange={(checked) => {
            setIsEntrepreneur(checked);
            setSaved(false);
          }}
        />
        <FieldContent>
          <FieldLabel htmlFor={`person-${person.id}-entrepreneur`}>
            Prowadzi działalność gospodarczą
          </FieldLabel>
          <FieldDescription>Wyższy roczny limit wpłat na IKZE.</FieldDescription>
        </FieldContent>
      </Field>
      {update.isError && (
        <p role="alert" className="text-sm text-destructive">
          {update.error.message}
        </p>
      )}
    </form>
  );
}
