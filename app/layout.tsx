import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./power-features.css";
import "./sheet-only.css";
import "./exercise-loads.css";
import "./reptriq-theme.css";
import PowerSuite from "./power-suite";
import ExerciseLoads from "./exercise-loads";
import ThemeBrand from "./theme-brand";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "REPTRIQ | Train. Track. Evolve.",
  description: "Aplicativo de treino e força com acompanhamento de PRs, histórico e evolução.",
  other: {
    "codex-preview": "development",
  },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/app-icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" data-theme="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <ThemeBrand />
        <ExerciseLoads />
        <PowerSuite />
      </body>
    </html>
  );
}
