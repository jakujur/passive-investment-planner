import type { Metadata } from "next";
import { RealEstatePage } from "@/components/assets/real-estate-page";

export const metadata: Metadata = { title: "Nieruchomości" };

export default function RealEstateRoute() {
  return <RealEstatePage />;
}
