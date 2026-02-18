import type { Metadata } from "next";
import { Cinzel, Inter } from "next/font/google";

import { AppFooter } from "@/components/app-footer";
import { Providers } from "@/components/providers";

import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap"
});

const cinzel = Cinzel({
  subsets: ["latin"],
  variable: "--font-cinzel",
  display: "swap"
});

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://strategos.vestival.es";

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: "Strategos | Architect of Capital",
  description:
    "Strategos is a portfolio intelligence platform for disciplined investors. Track, analyze, and understand your capital with clarity.",
  openGraph: {
    title: "Strategos | Architect of Capital",
    description:
      "Strategos is a portfolio intelligence platform for disciplined investors. Track, analyze, and understand your capital with clarity.",
    url: baseUrl,
    siteName: "Strategos",
    type: "website"
  },
  alternates: {
    canonical: baseUrl
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${cinzel.variable}`}>
      <body className="font-sans">
        <Providers>
          {children}
          <AppFooter />
        </Providers>
      </body>
    </html>
  );
}
