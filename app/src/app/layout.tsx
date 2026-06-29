import type { Metadata, Viewport } from "next";
import { Cal_Sans, Onest } from "next/font/google";
import "./globals.css";

const display = Cal_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  variable: "--font-display",
});

const sans = Onest({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600"],
  variable: "--font-sans",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://brume.cash"),
  title: "Brume: Public is the feature you opt into",
  description:
    "A privacy-first Solana wallet. Shielded transfers and policy-bound agents, built into the core, not bolted on. Sovereignty through silence.",
  openGraph: {
    title: "Brume: Public is the feature you opt into",
    description:
      "A privacy-first Solana wallet. Shielded transfers and policy-bound agents, built into the core.",
    siteName: "Brume",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#FFFFFF",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
