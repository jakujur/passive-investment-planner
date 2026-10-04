import type { Metadata } from "next";
import { SecuritiesPage } from "@/components/assets/securities-page";

export const metadata: Metadata = { title: "Akcje" };

export default function EquityPage() {
  return <SecuritiesPage kind="EQUITY" />;
}
