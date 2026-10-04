import type { Metadata } from "next";
import { ClassSettingsPage } from "@/components/assets/class-settings-page";

export const metadata: Metadata = { title: "Ustawienia: Nieruchomości" };

export default function Page() {
  return <ClassSettingsPage kind="REAL_ESTATE" />;
}
