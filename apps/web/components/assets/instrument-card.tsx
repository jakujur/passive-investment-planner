"use client";

import type { RouterOutputs } from "@pip/api";
import { useMutation } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SymbolSearch } from "@/components/symbol-search";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { formatIsoDate, formatPln } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

type Overview = Extract<RouterOutputs["assets"]["overview"], { kind: "EQUITY" | "GOLD" }>;

/** Which ETF the equity plan buys; "Edytuj" opens a search dialog that closes once a fund is chosen. */
export function InstrumentCard({
  instrument,
  lastQuote,
}: {
  instrument: Overview["purchaseInstrument"];
  lastQuote: Overview["lastQuote"];
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Instrument</CardTitle>
        <CardDescription>
          Fundusz, który plan kupuje za część wpłaty przypadającą na akcje.
        </CardDescription>
        <CardAction>
          <EditInstrumentDialog currentName={instrument?.name ?? null} />
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1 border-t border-border pt-3">
          {instrument ? (
            <>
              <span className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">{instrument.name}</span>
                {instrument.ticker && <Badge variant="secondary">{instrument.ticker}</Badge>}
                <Badge variant="secondary">{instrument.currency}</Badge>
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">
                {instrument.quoteSymbol ? `${instrument.quoteSymbol} · ` : ""}
                {lastQuote
                  ? `ostatnie notowanie ${formatIsoDate(lastQuote.date)}: ${formatPln(lastQuote.priceMinor)}`
                  : "brak notowań"}
              </span>
            </>
          ) : (
            <span className="text-sm text-muted-foreground">
              Nie ustawiono — plan nie może kupować akcji.
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function EditInstrumentDialog({ currentName }: { currentName: string | null }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const select = useMutation(
    trpc.instruments.selectForEquity.mutationOptions({
      onSuccess: () => {
        setChosen(null);
        setOpen(false);
        router.refresh();
      },
    }),
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) select.reset();
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <Pencil data-icon="inline-start" />
        Edytuj
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Zmień instrument</DialogTitle>
          <DialogDescription>
            {currentName ? `Teraz: ${currentName}. ` : ""}
            Wybrany fundusz staje się tym, który kupuje plan; notowania pobierają się same.
          </DialogDescription>
        </DialogHeader>
        <SymbolSearch
          id="instrument-search"
          label="Szukaj funduszu"
          placeholder="np. VWCE, Vanguard FTSE All-World"
          pending={select.isPending}
          onSelect={(hit) => {
            setChosen(hit.name);
            select.mutate({ symbol: hit.symbol });
          }}
        />
        {select.isPending && chosen && (
          <p role="status" className="text-sm text-muted-foreground">
            Pobieram notowania: {chosen}…
          </p>
        )}
        {select.isError && (
          <Alert variant="destructive">
            <AlertTitle>Nie udało się ustawić instrumentu</AlertTitle>
            <AlertDescription>{select.error.message}</AlertDescription>
          </Alert>
        )}
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Anuluj</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
