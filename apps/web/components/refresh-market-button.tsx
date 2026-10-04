"use client";

import { useMutation } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatIsoDate } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const SOURCE_LABEL = { NBP_FX: "NBP kursy", NBP_GOLD: "NBP złoto", YAHOO: "Yahoo" } as const;

export function RefreshMarketButton() {
  const trpc = useTRPC();
  const router = useRouter();
  const refresh = useMutation(
    trpc.market.refresh.mutationOptions({ onSuccess: () => router.refresh() }),
  );

  return (
    <div className="flex flex-col gap-3">
      <Button
        variant="outline"
        size="sm"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
        className="self-start"
      >
        {refresh.isPending ? <Spinner /> : <RefreshCw data-icon="inline-start" />}
        Odśwież notowania
      </Button>
      {refresh.isError && (
        <Alert variant="destructive">
          <AlertTitle>Nie udało się odświeżyć</AlertTitle>
          <AlertDescription>{refresh.error.message}</AlertDescription>
        </Alert>
      )}
      {refresh.data && (
        <ul className="flex flex-col text-sm">
          {refresh.data.map((report) => (
            <li
              key={`${report.source}-${report.key}`}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0"
            >
              <span className="min-w-0">
                <span className="font-medium">{SOURCE_LABEL[report.source]}</span>
                <span className="text-muted-foreground"> · {report.key}</span>
              </span>
              <span
                className={cn(
                  "tabular-nums",
                  report.error ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {report.error
                  ? report.error
                  : `+${report.stored}${report.rejected ? ` (odrzucone ${report.rejected})` : ""}${
                      report.lastDate ? ` · ${formatIsoDate(report.lastDate)}` : ""
                    }`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
