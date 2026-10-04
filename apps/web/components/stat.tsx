import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "default" | "hero" | "muted";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          tone === "hero" && "font-heading text-4xl leading-[1.1] md:text-5xl",
          tone === "default" && "text-xl font-medium",
          tone === "muted" && "text-xl font-medium text-muted-foreground",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}
