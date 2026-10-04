import type { AssetClassKind, Wrapper } from "@pip/engine";

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

export const WRAPPER_LABEL: Record<Wrapper, string> = {
  IKE: "IKE",
  IKE_OBLIGACJE: "IKE-Obligacje",
  IKZE: "IKZE",
  IKZE_OBLIGACJE: "IKZE-Obligacje",
  REGULAR: "Zwykłe",
  CASH: "Gotówka",
};

/** Short tag for an account: wrapper plus the IKZE variant when it matters. */
export function wrapperTag(wrapper: Wrapper, ikzeEntrepreneur: boolean): string {
  const label = WRAPPER_LABEL[wrapper];
  if ((wrapper === "IKZE" || wrapper === "IKZE_OBLIGACJE") && ikzeEntrepreneur) {
    return `${label} · przeds.`;
  }
  return label;
}
