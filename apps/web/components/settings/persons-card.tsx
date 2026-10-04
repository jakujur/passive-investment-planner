"use client";

import type { RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/lib/trpc";

type Person = RouterOutputs["settings"]["get"]["persons"][number];

export function PersonsCard({ persons }: { persons: Person[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Osoby</CardTitle>
        <CardDescription>
          Każda osoba ma własne limity IKE i IKZE; konta przypisujesz przy klasie aktywów.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="border-t border-border">
          {persons.map((person) => (
            <li key={person.id} className="border-b border-border py-3">
              <PersonRow person={person} removable={persons.length > 1} />
            </li>
          ))}
        </ul>
        <AddPersonForm />
      </CardContent>
    </Card>
  );
}

function PersonRow({ person, removable }: { person: Person; removable: boolean }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState(person.name);
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
  const dirty = name.trim() !== person.name;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Podaj imię.");
      return;
    }
    setError(null);
    update.mutate({ id: person.id, name: name.trim() });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
    >
      <Field data-invalid={error ? true : undefined} className="gap-1">
        <FieldLabel htmlFor={`person-${person.id}`} className="flex items-center gap-2">
          Imię
          {person.isUser && <Badge variant="secondary">Ty</Badge>}
          <span className="font-normal normal-case tracking-normal text-muted-foreground">
            {person.accounts.length === 0
              ? "bez kont"
              : `${person.accounts.length} ${person.accounts.length === 1 ? "konto" : person.accounts.length < 5 ? "konta" : "kont"}`}
          </span>
        </FieldLabel>
        <Input
          id={`person-${person.id}`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          aria-invalid={error ? true : undefined}
        />
        <FieldError>{error ?? (update.isError ? update.error.message : null)}</FieldError>
      </Field>
      <div className="flex items-center gap-2">
        {saved && !update.isPending && (
          <span role="status" className="text-sm text-primary">
            Zapisano.
          </span>
        )}
        <Button type="submit" variant="secondary" size="sm" disabled={update.isPending || !dirty}>
          {update.isPending && <Spinner />}
          Zapisz
        </Button>
        {removable && <RemovePersonButton person={person} />}
      </div>
    </form>
  );
}

function RemovePersonButton({ person }: { person: Person }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useMutation(
    trpc.settings.removePerson.mutationOptions({ onSuccess: () => router.refresh() }),
  );
  return (
    <div className="flex flex-col items-end gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Usuń osobę ${person.name}`} />
          }
          disabled={remove.isPending}
        >
          {remove.isPending ? <Spinner /> : <Trash2 />}
        </AlertDialogTrigger>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Usunąć {person.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Osobę można usunąć tylko wtedy, gdy nie ma żadnych kont.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Zostaw</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setOpen(false);
                remove.mutate({ id: person.id });
              }}
            >
              Usuń
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {remove.isError && (
        <p role="alert" className="text-sm text-destructive">
          {remove.error.message}
        </p>
      )}
    </div>
  );
}

function AddPersonForm() {
  const trpc = useTRPC();
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = useMutation(
    trpc.settings.addPerson.mutationOptions({
      onSuccess: () => {
        setName("");
        router.refresh();
      },
    }),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) {
      setError("Podaj imię.");
      return;
    }
    setError(null);
    add.mutate({ name: name.trim() });
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="grid gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"
    >
      <Field data-invalid={error ? true : undefined} className="gap-1">
        <FieldLabel htmlFor="person-new">Nowa osoba</FieldLabel>
        <Input
          id="person-new"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="np. Ania"
          aria-invalid={error ? true : undefined}
        />
        <FieldError>{error ?? (add.isError ? add.error.message : null)}</FieldError>
      </Field>
      <Button type="submit" variant="outline" size="sm" disabled={add.isPending}>
        {add.isPending ? <Spinner /> : <Plus data-icon="inline-start" />}
        Dodaj osobę
      </Button>
    </form>
  );
}
