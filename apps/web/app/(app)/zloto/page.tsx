import type { Metadata } from "next";
import { SecuritiesPage } from "@/components/assets/securities-page";

export const metadata: Metadata = { title: "Złoto" };

export default function GoldPage() {
  return <SecuritiesPage kind="GOLD" />;
}
