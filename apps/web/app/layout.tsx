import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";
import { TRPCReactProvider } from "@/lib/trpc";
import { cn } from "@/lib/utils";

const heading = Fraunces({
  subsets: ["latin", "latin-ext"],
  axes: ["SOFT", "opsz"],
  variable: "--font-heading",
});

const sans = IBM_Plex_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: { default: "Tracker inwestycji", template: "%s · Tracker inwestycji" },
  description: "Miesięczny plan wpłat dla gospodarstwa domowego",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pl" className={cn("h-full antialiased", sans.variable, heading.variable)}>
      <body className="atmosphere flex min-h-full flex-col">
        <TRPCReactProvider>{children}</TRPCReactProvider>
      </body>
    </html>
  );
}
