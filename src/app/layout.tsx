import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { ALLOW_INDEXING, SITE } from "@/config/seed";
import { Analytics } from "@/lib/analytics";
import "./globals.css";

// Fontes hospedadas localmente (sem requisição ao Google: mais rápido e melhor para a LGPD).
const fraunces = localFont({
  src: "./fonts/fraunces-opsz.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});
const barlow = localFont({
  src: [
    { path: "./fonts/barlow-400.woff2", weight: "400" },
    { path: "./fonts/barlow-500.woff2", weight: "500" },
    { path: "./fonts/barlow-600.woff2", weight: "600" },
    { path: "./fonts/barlow-700.woff2", weight: "700" },
  ],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = localFont({
  src: [
    { path: "./fonts/barlow-condensed-500.woff2", weight: "500" },
    { path: "./fonts/barlow-condensed-600.woff2", weight: "600" },
    { path: "./fonts/barlow-condensed-700.woff2", weight: "700" },
  ],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Fio do Bigode Barbearia | Barbearia clássica em Piracicaba",
    template: "%s | Fio do Bigode Barbearia",
  },
  description:
    "Barbearia em São Dimas, Piracicaba. Barba com toalha quente, cortes tradicionais e modernos, com horário agendado e pontual. Agende online.",
  openGraph: {
    type: "website",
    locale: "pt_BR",
    siteName: "Fio do Bigode Barbearia",
  },
  robots: ALLOW_INDEXING ? { index: true, follow: true } : { index: false, follow: false },
  // Verificação do Search Console: defina NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION no ambiente.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#0f0c0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${barlow.variable} ${barlowCondensed.variable}`}
    >
      <body className="min-h-dvh">
        {children}
        <Analytics />
      </body>
    </html>
  );
}
