const USER_AGENT = "passive-investment-planner/0.1 (prywatny tracker inwestycji)";

/** GET JSON; `null` on 404, which NBP returns for ranges without publications (weekends, holidays). */
export async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText} — ${url}`);
  return response.json();
}

/** Inclusive `[from, to]` date ranges of at most `days` days. */
export function dateChunks(from: string, to: string, days: number): [string, string][] {
  const chunks: [string, string][] = [];
  let start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (start <= end) {
    const chunkEnd = new Date(start);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + days - 1);
    const stop = chunkEnd < end ? chunkEnd : end;
    chunks.push([isoDate(start), isoDate(stop)]);
    start = new Date(stop);
    start.setUTCDate(start.getUTCDate() + 1);
  }
  return chunks;
}

export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return isoDate(d);
}

/** Drops points whose change from the previous accepted point exceeds `maxChangeBp`. */
export function dropOutliers<T>(
  points: readonly T[],
  valueFor: (point: T) => bigint,
  maxChangeBp: bigint,
  previous: bigint | null,
): { accepted: T[]; rejected: T[] } {
  const accepted: T[] = [];
  const rejected: T[] = [];
  let last = previous;
  for (const point of points) {
    const value = valueFor(point);
    const tooBig =
      value <= 0n ||
      (last !== null &&
        ((value > last ? value - last : last - value) * 10_000n) / last > maxChangeBp);
    if (tooBig) {
      rejected.push(point);
    } else {
      accepted.push(point);
      last = value;
    }
  }
  return { accepted, rejected };
}
