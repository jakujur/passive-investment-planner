"use client";

import type { RouterInputs, RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { LimitBar } from "@/components/limit-bar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { wrapperTag } from "@/lib/classes";
import { formatPln } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type InvestKind = RouterInputs["accounts"]["create"]["assetKind"];
type AccountFill = RouterOutputs["settings"]["get"]["accountFill"];
type WrapperInput = RouterInputs["accounts"]["create"]["wrapper"];
type QueueAccount = RouterOutputs["assets"]["overview"]["queue"][number];

export interface AccountOptions {
  wrappers: readonly WrapperInput[];
  brokers: readonly string[];
}

interface AccountType {
  id: string;
  wrapper: WrapperInput;
  ikzeEntrepreneur: boolean;
  label: string;
}

const PLAIN_LABEL: Record<WrapperInput, string> = {
  REGULAR: "Zwykłe",
  IKE: "IKE",
  IKZE: "IKZE",
  IKE_OBLIGACJE: "IKE-Obligacje",
  IKZE_OBLIGACJE: "IKZE-Obligacje",
};

/** Account types offered in the add dialog: IKZE splits into the two limit variants. */
function accountTypes(kind: InvestKind, wrappers: readonly WrapperInput[]): AccountType[] {
  const ordered =
    kind === "BONDS" ? wrappers : [...wrappers].sort((a) => (a === "REGULAR" ? -1 : 0));
  return ordered.flatMap((wrapper): AccountType[] => {
    if (wrapper === "IKZE" || wrapper === "IKZE_OBLIGACJE") {
      return [
        {
          id: wrapper,
          wrapper,
          ikzeEntrepreneur: false,
          label: `${PLAIN_LABEL[wrapper]} (osoba fizyczna)`,
        },
        {
          id: `${wrapper}_B2B`,
          wrapper,
          ikzeEntrepreneur: true,
          label: `${PLAIN_LABEL[wrapper]} (przedsiębiorca)`,
        },
      ];
    }
    return [
      {
        id: wrapper,
        wrapper,
        ikzeEntrepreneur: false,
        label: wrapper === "REGULAR" && kind === "BONDS" ? "Rejestr zwykły" : PLAIN_LABEL[wrapper],
      },
    ];
  });
}

function brokersFor(brokers: readonly string[], wrapper: QueueAccount["wrapper"]): string[] {
  return brokers.filter((b) => b !== "BullionVault" || wrapper === "REGULAR");
}

function isIkze(wrapper: QueueAccount["wrapper"]): boolean {
  return wrapper === "IKZE" || wrapper === "IKZE_OBLIGACJE";
}

function isTaxWrapper(wrapper: QueueAccount["wrapper"]): boolean {
  return wrapper !== "REGULAR" && wrapper !== "CASH";
}

/** Ordinal in sequential mode; "+" for accounts that share each month, "→" for the regular ones after them. */
function queueGlyph(fill: AccountFill, index: number, tax: boolean): string {
  if (fill === "SEQUENTIAL") return `${index + 1}.`;
  return tax ? "+" : "→";
}

export function AccountsCard({
  kind,
  queue,
  options,
  persons,
  purchaseInstrumentId,
  accountFill,
}: {
  kind: InvestKind;
  queue: QueueAccount[];
  options: AccountOptions;
  persons: { id: string; name: string }[];
  purchaseInstrumentId: string | null;
  accountFill: AccountFill;
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [order, setOrder] = useState(() => queue.map((a) => a.id));
  const byId = new Map(queue.map((a) => [a.id, a]));
  const showPerson = persons.length > 1;
  const reorder = useMutation(
    trpc.assets.updateClass.mutationOptions({ onSuccess: () => router.refresh() }),
  );

  function move(index: number, delta: -1 | 1) {
    const next = [...order];
    const target = index + delta;
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(target, 0, item);
    setOrder(next);
    reorder.mutate({ kind, accountQueue: next, purchaseInstrumentId });
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Konta</CardTitle>
        <CardDescription>
          {accountFill === "EVEN"
            ? "Równomiernie: co miesiąc na każde IKE/IKZE do 1/12 rocznego limitu, nadwyżka na rachunek zwykły. "
            : "Po kolei: najpierw zapełnia pierwsze konto, potem następne, na końcu zwykłe. "}
          <Link
            href="/plan/ustawienia"
            className="underline underline-offset-4 hover:text-foreground"
          >
            Zmień w ustawieniach planu.
          </Link>
        </CardDescription>
        <CardAction>
          <AddAccountDialog kind={kind} options={options} persons={persons} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {order.length === 0 ? (
          <p className="border-t border-border pt-3 text-sm text-muted-foreground">
            Brak kont — plan nie ma gdzie wpłacać. Dodaj pierwsze konto.
          </p>
        ) : (
          <ol className="border-t border-border">
            {order.map((id, index) => {
              const account = byId.get(id);
              if (!account) return null;
              return (
                <li
                  key={id}
                  className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2 border-b border-border py-3"
                >
                  <span
                    aria-hidden
                    className="font-heading text-lg leading-6 text-muted-foreground tabular-nums"
                  >
                    {queueGlyph(accountFill, index, isTaxWrapper(account.wrapper))}
                  </span>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                      <span className="truncate font-medium">{account.name}</span>
                      <Badge variant="secondary">
                        {wrapperTag(account.wrapper, account.ikzeEntrepreneur)}
                      </Badge>
                      <span className="text-muted-foreground">
                        {account.broker}
                        {showPerson ? ` · ${account.personName}` : ""}
                      </span>
                    </span>
                    {account.limit ? (
                      <LimitBar
                        caption={
                          accountFill === "EVEN"
                            ? `miesięcznie do ${formatPln(account.limit.limitMinor / 12n)}`
                            : "limit roczny"
                        }
                        person={null}
                        usedMinor={account.limit.usedMinor}
                        limitMinor={account.limit.limitMinor}
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">bez limitu rocznego</span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Przesuń ${account.name} wyżej`}
                      disabled={index === 0 || reorder.isPending}
                      onClick={() => move(index, -1)}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Przesuń ${account.name} niżej`}
                      disabled={index === order.length - 1 || reorder.isPending}
                      onClick={() => move(index, 1)}
                    >
                      <ArrowDown />
                    </Button>
                    <EditAccountDialog account={account} brokers={options.brokers} />
                    <DeleteAccountButton account={account} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
        {reorder.isError && (
          <p role="alert" className="text-sm text-destructive">
            {reorder.error.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AddAccountDialog({
  kind,
  options,
  persons,
}: {
  kind: InvestKind;
  options: AccountOptions;
  persons: { id: string; name: string }[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const types = accountTypes(kind, options.wrappers);
  const [open, setOpen] = useState(false);
  const [typeId, setTypeId] = useState(types[0]?.id ?? "");
  const [broker, setBroker] = useState(options.brokers[0] ?? "");
  const [personId, setPersonId] = useState(persons[0]?.id ?? "");
  const [name, setName] = useState("");
  const type = types.find((t) => t.id === typeId) ?? types[0];
  const brokers = brokersFor(options.brokers, type?.wrapper ?? "REGULAR");
  const brokerFixed = brokers.length === 1;
  const effectiveBroker = brokers.includes(broker) ? broker : (brokers[0] ?? "");
  const create = useMutation(
    trpc.accounts.create.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        setName("");
        router.refresh();
      },
    }),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!type) return;
    create.mutate({
      assetKind: kind,
      wrapper: type.wrapper,
      ikzeEntrepreneur: type.ikzeEntrepreneur,
      broker: effectiveBroker,
      personId: persons.length > 1 ? personId : null,
      name: name.trim() === "" ? null : name.trim(),
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) create.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Plus data-icon="inline-start" />
        Dodaj konto
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>Nowe konto</DialogTitle>
            <DialogDescription>
              Konto trafi do kolejki tej klasy: ulgi podatkowe przed zwykłymi.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-5">
            <Field>
              <FieldLabel htmlFor="acc-type">Rodzaj</FieldLabel>
              <NativeSelect
                id="acc-type"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                className="w-full"
              >
                {types.map((t) => (
                  <NativeSelectOption key={t.id} value={t.id}>
                    {t.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {type?.ikzeEntrepreneur && (
                <FieldDescription>
                  Wyższy roczny limit wpłat dla prowadzących działalność.
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="acc-broker">Platforma</FieldLabel>
              <NativeSelect
                id="acc-broker"
                className="w-full"
                value={effectiveBroker}
                onChange={(e) => setBroker(e.target.value)}
                disabled={brokerFixed}
              >
                {brokers.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {brokerFixed && (
                <FieldDescription>
                  Obligacje detaliczne prowadzi tylko {brokers[0]}.
                </FieldDescription>
              )}
            </Field>
            {persons.length > 1 && (
              <Field>
                <FieldLabel htmlFor="acc-person">Właściciel</FieldLabel>
                <NativeSelect
                  id="acc-person"
                  className="w-full"
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                >
                  {persons.map((p) => (
                    <NativeSelectOption key={p.id} value={p.id}>
                      {p.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="acc-name">Własna nazwa</FieldLabel>
              <Input
                id="acc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={type ? `${PLAIN_LABEL[type.wrapper]} · ${effectiveBroker}` : ""}
                maxLength={80}
              />
              <FieldDescription>
                Opcjonalnie; puste pole nada nazwę z rodzaju i platformy.
              </FieldDescription>
            </Field>
          </FieldGroup>
          {create.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się dodać konta</AlertTitle>
              <AlertDescription>{create.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={create.isPending || !type}>
              {create.isPending && <Spinner />}
              Dodaj
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditAccountDialog({
  account,
  brokers,
}: {
  account: QueueAccount;
  brokers: readonly string[];
}) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account.name);
  const [broker, setBroker] = useState(account.broker);
  const [ikzeEntrepreneur, setIkzeEntrepreneur] = useState(account.ikzeEntrepreneur);
  const [error, setError] = useState<string | null>(null);
  const offered = brokersFor(brokers, account.wrapper);
  // Accounts created from a layout may sit at a platform the class no longer offers; keep it selectable.
  const allowed = offered.includes(account.broker) ? offered : [account.broker, ...offered];
  const update = useMutation(
    trpc.accounts.update.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() === "") {
      setError("Podaj nazwę.");
      return;
    }
    setError(null);
    update.mutate({ id: account.id, name: name.trim(), broker, ikzeEntrepreneur });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) update.reset();
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Edytuj ${account.name}`} />}
      >
        <Pencil />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="contents">
          <DialogHeader>
            <DialogTitle>{account.name}</DialogTitle>
            <DialogDescription>
              {wrapperTag(account.wrapper, account.ikzeEntrepreneur)}
              {" · "}
              {account.personName}. Rodzaju konta nie da się zmienić — usuń je i dodaj ponownie.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-5">
            <Field data-invalid={error ? true : undefined}>
              <FieldLabel htmlFor={`acc-${account.id}-name`}>Nazwa</FieldLabel>
              <Input
                id={`acc-${account.id}-name`}
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={80}
                aria-invalid={error ? true : undefined}
              />
              <FieldError>{error}</FieldError>
            </Field>
            <Field>
              <FieldLabel htmlFor={`acc-${account.id}-broker`}>Platforma</FieldLabel>
              <NativeSelect
                id={`acc-${account.id}-broker`}
                className="w-full"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
                disabled={allowed.length === 1}
              >
                {allowed.map((b) => (
                  <NativeSelectOption key={b} value={b}>
                    {b}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            {isIkze(account.wrapper) && (
              <Field orientation="horizontal">
                <Checkbox
                  id={`acc-${account.id}-b2b`}
                  checked={ikzeEntrepreneur}
                  onCheckedChange={(checked) => setIkzeEntrepreneur(checked === true)}
                />
                <FieldContent>
                  <FieldLabel htmlFor={`acc-${account.id}-b2b`}>IKZE przedsiębiorcy</FieldLabel>
                  <FieldDescription>Wyższy roczny limit wpłat.</FieldDescription>
                </FieldContent>
              </Field>
            )}
          </FieldGroup>
          {update.isError && (
            <Alert variant="destructive">
              <AlertTitle>Nie udało się zapisać</AlertTitle>
              <AlertDescription>{update.error.message}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Spinner />}
              Zapisz
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteAccountButton({ account }: { account: QueueAccount }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const remove = useMutation(
    trpc.accounts.delete.mutationOptions({
      onSuccess: () => {
        setOpen(false);
        router.refresh();
      },
    }),
  );
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) remove.reset();
      }}
    >
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-xs" aria-label={`Usuń ${account.name}`} />}
        disabled={remove.isPending}
      >
        {remove.isPending ? <Spinner /> : <Trash2 />}
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Usunąć {account.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Konto zniknie z kolejki. Można usunąć tylko konto bez transakcji.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-destructive">
            {remove.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Zostaw</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => remove.mutate({ id: account.id })}
            disabled={remove.isPending}
          >
            {remove.isPending && <Spinner />}
            Usuń
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
