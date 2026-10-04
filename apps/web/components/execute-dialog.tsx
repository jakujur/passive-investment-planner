"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatMonth, formatPln } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

/** "Wykonane": books the month after a confirmation; the same control on the dashboard and the plan page. */
export function ExecuteDialog({
  month,
  amount,
  adjustmentMinor,
  disabled,
  size = "default",
}: {
  month: string;
  amount: bigint;
  adjustmentMinor: bigint;
  disabled: boolean;
  size?: "default" | "sm" | "lg";
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const execute = useMutation(
    trpc.plan.execute.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.plan.pathFilter());
        router.refresh();
      },
    }),
  );

  return (
    <div className="flex flex-col items-start gap-1">
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogTrigger
          render={<Button size={size} disabled={disabled || execute.isPending} />}
        >
          {execute.isPending ? <Spinner /> : <BookCheck data-icon="inline-start" />}
          Wykonane
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Zaksięgować {formatMonth(month).toLocaleLowerCase("pl-PL")}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Plan na {formatPln(amount)} zostanie zapisany jako wykonany: wpłaty i zakupy trafią do
              historii transakcji, a limity IKE/IKZE zostaną zaktualizowane. Tej operacji nie da się
              cofnąć.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Jeszcze nie</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setOpen(false);
                execute.mutate({ adjustmentMinor });
              }}
            >
              Księguję
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {execute.isError && (
        <p role="alert" className="text-sm text-destructive">
          {execute.error.message}
        </p>
      )}
    </div>
  );
}
