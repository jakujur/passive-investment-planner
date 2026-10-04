"use client";

import type { RouterOutputs } from "@pip/api";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { useTRPC } from "@/lib/trpc";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { cn } from "@/lib/utils";

export type SymbolHit = RouterOutputs["instruments"]["search"][number];

const SEARCH_DELAY_MS = 300;
const MIN_QUERY_LENGTH = 2;

const QUOTE_TYPE_LABEL: Record<string, string> = {
  ETF: "ETF",
  EQUITY: "Akcja",
  MUTUALFUND: "Fundusz",
  INDEX: "Indeks",
};

/** Debounced Yahoo symbol search with a result list; the parent decides what choosing a hit does. */
export function SymbolSearch({
  id,
  label,
  description,
  placeholder,
  onSelect,
  pending,
  size = "default",
}: {
  id: string;
  label: string;
  description?: string;
  placeholder: string;
  onSelect: (hit: SymbolHit) => void;
  pending: boolean;
  size?: "default" | "sm";
}) {
  const trpc = useTRPC();
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), SEARCH_DELAY_MS);
  const enabled = debounced.length >= MIN_QUERY_LENGTH;
  const search = useQuery(
    trpc.instruments.search.queryOptions({ query: enabled ? debounced : "-" }, { enabled }),
  );
  const searching = enabled && (search.isFetching || debounced !== query.trim());
  const hits = enabled ? (search.data ?? []) : [];

  return (
    <div className="flex flex-col gap-2">
      <Field className={cn(size === "sm" && "gap-1")}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <InputGroup>
          <InputGroupAddon align="inline-start">
            {searching || pending ? <Spinner className="size-3.5" /> : <Search />}
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            type="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-controls={`${id}-results`}
            aria-expanded={hits.length > 0}
          />
        </InputGroup>
        {description && <FieldDescription>{description}</FieldDescription>}
      </Field>
      {enabled && (
        <div id={`${id}-results`} aria-live="polite">
          {search.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {search.error.message}
            </p>
          ) : hits.length === 0 && !searching ? (
            <p className="text-sm text-muted-foreground">Nic nie znaleziono.</p>
          ) : (
            <ul className="border-t border-border">
              {hits.map((hit) => (
                <li key={hit.symbol} className="border-b border-border">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => {
                      onSelect(hit);
                      setQuery("");
                    }}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-2 text-left text-sm transition-colors outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-50"
                  >
                    <span className="truncate font-medium">{hit.name}</span>
                    <span className="flex items-center gap-1.5">
                      <Badge variant="secondary">
                        {QUOTE_TYPE_LABEL[hit.quoteType] ?? hit.quoteType}
                      </Badge>
                      {hit.instrumentId && <Badge>W katalogu</Badge>}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {hit.symbol}
                      {hit.exchange ? ` · ${hit.exchange}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
