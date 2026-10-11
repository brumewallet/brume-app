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
  title: "Brume: The wallet that tells you what is public",
  description:
    "A Solana wallet with a shielded balance only your key controls, dApp connect, and a plain disclosure of what stays visible on-chain.",
  openGraph: {
    title: "Brume: The wallet that tells you what is public",
    description:
      "A Solana wallet with a shielded balance only your key controls, and a plain disclosure of what stays visible on-chain.",
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
