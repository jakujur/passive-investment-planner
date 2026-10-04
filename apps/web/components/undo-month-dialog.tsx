"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Undo2 } from "lucide-react";
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
import { formatMonth } from "@/lib/format";
import { useTRPC } from "@/lib/trpc";

/** "Cofnij księgowanie": reverses the newest booked month so it can be booked again. */
export function UndoMonthDialog({
  planId,
  month,
  size = "sm",
}: {
  planId: string;
  month: string;
  size?: "xs" | "sm";
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const undo = useMutation(
    trpc.plan.undo.mutationOptions({
      onSuccess: async () => {
        setOpen(false);
        await queryClient.invalidateQueries(trpc.plan.pathFilter());
        router.refresh();
      },
    }),
  );

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) undo.reset();
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" size={size} />}>
        {undo.isPending ? <Spinner /> : <Undo2 data-icon="inline-start" />}
        Cofnij księgowanie
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Cofnąć księgowanie: {formatMonth(month).toLocaleLowerCase("pl-PL")}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            Wpłaty i zakupy tego miesiąca znikną z księgi, a limity IKE/IKZE i pozycje przeliczą się
            od nowa. Miesiąc będzie można zaksięgować ponownie.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {undo.isError && (
          <p role="alert" className="text-sm text-destructive">
            {undo.error.message}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Zostaw</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={undo.isPending}
            onClick={() => undo.mutate({ planId })}
          >
            {undo.isPending && <Spinner />}
            Cofam
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
