import { validatePersonAccounts, wrapperFamily } from "@pip/engine";
import { describe, expect, it } from "vitest";
import { ACCOUNT_LAYOUTS, LAYOUTS } from "./layouts";

describe.each(ACCOUNT_LAYOUTS)("layout %s", (layout) => {
  const blueprint = LAYOUTS[layout];

  it("gives every person at most one IKE and one IKZE", () => {
    for (let person = 0; person < blueprint.persons; person++) {
      const accounts = blueprint.accounts
        .filter((a) => a.personIndex === person)
        .map((a) => ({ wrapper: a.wrapper, currency: "PLN" as const }));
      expect(validatePersonAccounts(accounts)).toEqual([]);
    }
  });

  it("ends every queue with an existing account without a limit", () => {
    const byKey = new Map(blueprint.accounts.map((a) => [a.key, a]));
    for (const queue of Object.values(blueprint.queues)) {
      for (const key of queue) expect(byKey.has(key)).toBe(true);
      const last = byKey.get(queue.at(-1) ?? "");
      expect(last && wrapperFamily(last.wrapper)).toBeNull();
    }
  });
});
