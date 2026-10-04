import type { AssetClassKind } from "@pip/engine";

export interface ClassMeta {
  kind: AssetClassKind;
  slug: string;
  name: string;
  /** Tailwind background utility bound to the class colour token. */
  bg: string;
  /** Tailwind text utility bound to the class colour token. */
  text: string;
  /** CSS variable with the class colour, for chart configs. */
  colorVar: string;
}

export const CLASSES: Record<AssetClassKind, ClassMeta> = {
  EQUITY: {
    kind: "EQUITY",
    slug: "akcje",
    name: "Akcje",
    bg: "bg-class-equity",
    text: "text-class-equity",
    colorVar: "var(--class-equity)",
  },
  BONDS: {
    kind: "BONDS",
    slug: "obligacje",
    name: "Obligacje",
    bg: "bg-class-bonds",
    text: "text-class-bonds",
    colorVar: "var(--class-bonds)",
  },
  REAL_ESTATE: {
    kind: "REAL_ESTATE",
    slug: "nieruchomosci",
    name: "Nieruchomości",
    bg: "bg-class-real-estate",
    text: "text-class-real-estate",
    colorVar: "var(--class-real-estate)",
  },
  GOLD: {
    kind: "GOLD",
    slug: "zloto",
    name: "Złoto",
    bg: "bg-class-gold",
    text: "text-class-gold",
    colorVar: "var(--class-gold)",
  },
};

export const CLASS_ORDER: AssetClassKind[] = ["EQUITY", "BONDS", "REAL_ESTATE", "GOLD"];

export function classPath(kind: AssetClassKind): string {
  return `/${CLASSES[kind].slug}`;
}

export function classSettingsPath(kind: AssetClassKind): string {
  return `/${CLASSES[kind].slug}/ustawienia`;
}
