import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-0.5">
        {eyebrow && (
          <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {eyebrow}
          </span>
        )}
        <h1 className="font-heading text-2xl leading-tight">{title}</h1>
        {lead && <p className="max-w-prose text-sm text-muted-foreground">{lead}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
