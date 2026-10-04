"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { MoneyInput } from "@/components/money-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { MONEY_FORMAT_HINT, moneyToInput, readMoney } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

/** Rent paid for the flat you live in — the reference point for "buy or keep renting". */
export function RentCard({ currentRentMinor }: { currentRentMinor: bigint | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [raw, setRaw] = useState(currentRentMinor === null ? "" : moneyToInput(currentRentMinor));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const update = useMutation(
    trpc.realEstate.updateSettings.mutationOptions({
      onSuccess: () => {
        setSaved(true);
        router.refresh();
      },
    }),
  );
  const initial = currentRentMinor === null ? "" : moneyToInput(currentRentMinor);
  const dirty = raw.trim() !== initial;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const rent = raw.trim() === "" ? null : readMoney(raw);
    if (raw.trim() !== "" && (rent === null || rent < 0n)) {
      setError(MONEY_FORMAT_HINT);
      return;
    }
    setError(null);
    update.mutate({ currentRentMinor: rent });
  }

  return (
    <Card size="sm">
      <CardContent>
        <form
          onSubmit={onSubmit}
          noValidate
          className="grid gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,20rem)_auto] sm:items-end"
        >
          <Field data-invalid={error ? true : undefined} className="gap-1">
            <FieldLabel htmlFor="current-rent">Czynsz, który płacisz za mieszkanie</FieldLabel>
            <MoneyInput
              id="current-rent"
              value={raw}
              onChange={(value) => {
                setRaw(value);
                setSaved(false);
              }}
              placeholder="brak — mieszkam u siebie"
              aria-invalid={error ? true : undefined}
            />
            <FieldDescription>
              Miesięcznie; punkt odniesienia dla decyzji kupić czy wynajmować. Puste, jeśli nie
              wynajmujesz.
            </FieldDescription>
            <FieldError>{error ?? (update.isError ? update.error.message : null)}</FieldError>
          </Field>
          <div className="flex items-center gap-3 sm:pb-6">
            {saved && !update.isPending && (
              <span role="status" className="text-sm text-primary">
                Zapisano.
              </span>
            )}
            <Button
              type="submit"
              variant="secondary"
              size="sm"
              disabled={update.isPending || !dirty}
            >
              {update.isPending && <Spinner />}
              Zapisz
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
