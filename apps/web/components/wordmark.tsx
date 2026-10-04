import { cn } from "@/lib/utils";

export function Wordmark({ size = "sm", className }: { size?: "sm" | "lg"; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <span
        aria-hidden
        className={cn(
          "grid shrink-0 place-items-center bg-primary font-heading text-primary-foreground",
          size === "lg" ? "size-10 text-xl" : "size-7 text-sm",
        )}
      >
        T
      </span>
      <span className="flex flex-col leading-none">
        <span
          className={cn("font-heading whitespace-nowrap", size === "lg" ? "text-2xl" : "text-base")}
        >
          Tracker inwestycji
        </span>
        {size === "lg" && (
          <span className="mt-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Księga gospodarstwa
          </span>
        )}
      </span>
    </span>
  );
}
