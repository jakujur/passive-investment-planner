import type { Wrapper } from "@pip/engine";

export const ACCOUNT_LAYOUTS = ["SINGLE_A", "SINGLE_B", "SINGLE_C", "COUPLE"] as const;
export type AccountLayout = (typeof ACCOUNT_LAYOUTS)[number];

export interface AccountBlueprint {
  key: string;
  personIndex: 0 | 1;
  name: string;
  broker: string;
  wrapper: Wrapper;
}

export interface LayoutBlueprint {
  title: string;
  summary: string;
  persons: 1 | 2;
  accounts: AccountBlueprint[];
  /** Account keys in fill order; each queue ends with an account without a limit. */
  queues: { EQUITY: string[]; BONDS: string[]; GOLD: string[] };
}

/** Accounts every household gets, owned by the first person. */
const COMMON: AccountBlueprint[] = [
  { key: "cushion", personIndex: 0, name: "Poduszka", broker: "Bank", wrapper: "CASH" },
  { key: "xtb", personIndex: 0, name: "Rachunek zwykły", broker: "XTB", wrapper: "REGULAR" },
  {
    key: "bonds",
    personIndex: 0,
    name: "Rejestr zwykły",
    broker: "PKO BP",
    wrapper: "REGULAR",
  },
  { key: "gold", personIndex: 0, name: "Złoto", broker: "BullionVault", wrapper: "REGULAR" },
];

export const LAYOUTS: Record<AccountLayout, LayoutBlueprint> = {
  SINGLE_A: {
    title: "Singiel A — oba opakowania na ETF",
    summary: "IKE i IKZE w XTB na globalny ETF. EDO na zwykłym rejestrze, z podatkiem Belki.",
    persons: 1,
    accounts: [
      { key: "ike", personIndex: 0, name: "IKE", broker: "XTB", wrapper: "IKE" },
      { key: "ikze", personIndex: 0, name: "IKZE", broker: "XTB", wrapper: "IKZE" },
      ...COMMON,
    ],
    queues: { EQUITY: ["ike", "ikze", "xtb"], BONDS: ["bonds"], GOLD: ["gold"] },
  },
  SINGLE_B: {
    title: "Singiel B — IKE na ETF, IKZE na obligacje",
    summary: "IKE w XTB na ETF, IKZE-Obligacje w PKO BP na EDO bez Belki.",
    persons: 1,
    accounts: [
      { key: "ike", personIndex: 0, name: "IKE", broker: "XTB", wrapper: "IKE" },
      {
        key: "ikze-obl",
        personIndex: 0,
        name: "IKZE-Obligacje",
        broker: "PKO BP",
        wrapper: "IKZE_OBLIGACJE",
      },
      ...COMMON,
    ],
    queues: { EQUITY: ["ike", "xtb"], BONDS: ["ikze-obl", "bonds"], GOLD: ["gold"] },
  },
  SINGLE_C: {
    title: "Singiel C — IKE na obligacje, IKZE na ETF",
    summary: "IKE-Obligacje w PKO BP na EDO bez Belki, IKZE w XTB na ETF.",
    persons: 1,
    accounts: [
      {
        key: "ike-obl",
        personIndex: 0,
        name: "IKE-Obligacje",
        broker: "PKO BP",
        wrapper: "IKE_OBLIGACJE",
      },
      { key: "ikze", personIndex: 0, name: "IKZE", broker: "XTB", wrapper: "IKZE" },
      ...COMMON,
    ],
    queues: { EQUITY: ["ikze", "xtb"], BONDS: ["ike-obl", "bonds"], GOLD: ["gold"] },
  },
  COUPLE: {
    title: "Para — model z poradnika",
    summary:
      "Osoba 1: IKE i IKZE na ETF. Osoba 2: IKE-Obligacje na EDO i IKZE na ETF. Cztery opakowania.",
    persons: 2,
    accounts: [
      { key: "ike-1", personIndex: 0, name: "IKE", broker: "XTB", wrapper: "IKE" },
      { key: "ikze-1", personIndex: 0, name: "IKZE", broker: "XTB", wrapper: "IKZE" },
      {
        key: "ike-obl-2",
        personIndex: 1,
        name: "IKE-Obligacje",
        broker: "PKO BP",
        wrapper: "IKE_OBLIGACJE",
      },
      { key: "ikze-2", personIndex: 1, name: "IKZE", broker: "XTB", wrapper: "IKZE" },
      ...COMMON,
    ],
    queues: {
      EQUITY: ["ike-1", "ikze-1", "ikze-2", "xtb"],
      BONDS: ["ike-obl-2", "bonds"],
      GOLD: ["gold"],
    },
  },
};
