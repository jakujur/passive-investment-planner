import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { formatPln, percentOf } from "@/lib/format";

/** Yearly IKE/IKZE room of one account: tag or caption · owner · used / limit over a hairline track. */
export function LimitBar({
  tag,
  caption,
  person,
  usedMinor,
  limitMinor,
}: {
  tag?: string;
  caption?: string;
  person: string | null;
  usedMinor: bigint;
  limitMinor: bigint;
}) {
  return (
    <Progress
      value={Math.min(100, percentOf(usedMinor, limitMinor))}
      aria-label={`Wykorzystanie limitu ${tag ?? caption ?? ""}${person ? ` (${person})` : ""}`}
      className="gap-x-2 gap-y-1.5"
    >
      {tag && <Badge>{tag}</Badge>}
      {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
      {person && <span className="truncate text-xs text-muted-foreground">{person}</span>}
      <span className="ml-auto text-xs tabular-nums">
        {formatPln(usedMinor)}
        <span className="text-muted-foreground"> / {formatPln(limitMinor)}</span>
      </span>
    </Progress>
  );
}
