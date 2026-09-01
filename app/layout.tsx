import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Site Canvas – Infrastrukturkort",
  description: "Kortlæg netværk, fiber, kameraer og teknisk udstyr direkte på dit eget områdekort.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="da">
      <body>{children}</body>
    </html>
  );
}
