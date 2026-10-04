import type { Metadata } from "next";
import { BondsPage } from "@/components/assets/bonds-page";

export const metadata: Metadata = { title: "Obligacje" };

export default function BondsRoute() {
  return <BondsPage />;
}
