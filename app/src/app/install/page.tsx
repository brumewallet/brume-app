import type { Metadata } from "next";
import Link from "next/link";
import { BrumeMark, BrumeWordmark } from "@/components/marketing/logo";

export const metadata: Metadata = {
  title: "Install Brume Beta · Brume",
  description:
    "Load the Brume wallet extension in Chrome in three steps. Devnet only - no real funds at risk.",
};

const STEPS = [
  {
    n: "01",
    heading: "Download the latest release",
    body: (
      <>
        Go to{" "}
        <a
          href="https://github.com/brume-wallet/brume-app/releases"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ube-600 underline-offset-2 hover:underline"
        >
          github.com/brume-wallet/brume-app/releases
        </a>{" "}
        and download the latest <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">brume-wallet-*.zip</code> asset.
        Extract it to a folder you will remember.
      </>
    ),
  },
  {
    n: "02",
    heading: "Load in Chrome",
    body: (
      <>
        Open{" "}
        <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">chrome://extensions</code>
        in your browser. Enable <strong>Developer mode</strong> (top-right toggle).
        Click <strong>Load unpacked</strong> and select the <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">dist/</code> folder
        from the zip you extracted.
      </>
    ),
  },
  {
    n: "03",
    heading: "Set up and try Shield",
    body: (
      <>
        Pin Brume to the toolbar. Open the extension, create or import a wallet, then go to{" "}
        <strong>Settings → Network → Devnet</strong>.
        Request a devnet airdrop, then tap the <strong>Shield</strong> tab to try shielded
        transfers. Read the{" "}
        <Link
          href="/disclosure"
          className="font-medium text-ube-600 underline-offset-2 hover:underline"
        >
          trust disclosure
        </Link>{" "}
        before depositing any real funds on mainnet.
      </>
    ),
  },
];

export default function InstallPage() {
  return (
    <div className="relative min-h-screen bg-white">
      <div
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-brume-mesh"
        aria-hidden
      />

      <header className="border-b hairline">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-6">
          <Link href="/" className="press" aria-label="Brume home">
            <BrumeWordmark />
          </Link>
          <Link
            href="/disclosure"
            className="text-sm font-medium text-navy-500 transition-colors hover:text-ink"
          >
            Disclosure
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full glass-soft px-3.5 py-1.5 text-xs font-medium text-navy-500">
            <span className="h-1.5 w-1.5 rounded-full bg-ube-400" />
            Beta · Devnet only
          </span>
          <h1 className="mt-5 font-display text-[clamp(2.25rem,5vw,3.25rem)] tracking-tightest text-ink">
            Install the beta in three steps.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-navy-500">
            No app store, no waitlist. Load the unpacked extension directly from the latest
            GitHub release.
          </p>
        </div>

        <div className="mt-8 max-w-xl rounded-2xl border-l-2 border-amber-400 glass p-5">
          <p className="font-semibold text-ink">Devnet only - no real funds at risk.</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-500">
            The on-chain shielded pool is deployed to Solana Devnet. All tokens are test tokens.
            Mainnet deployment will follow after Phase 2 ZK proving is complete.
          </p>
        </div>

        <ol className="mt-12 max-w-2xl space-y-10">
          {STEPS.map((step) => (
            <li key={step.n} className="flex gap-6">
              <span
                className="mt-0.5 shrink-0 font-display text-4xl font-normal leading-none tracking-tightest text-navy-200"
                aria-hidden
              >
                {step.n}
              </span>
              <div>
                <h2 className="font-display text-xl tracking-tightest text-ink sm:text-2xl">
                  {step.heading}
                </h2>
                <p className="mt-2 leading-relaxed text-navy-500">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </main>

      <footer className="mx-auto max-w-5xl px-5 pb-12 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-4 border-t hairline pt-8 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm text-navy-400">
            <BrumeMark className="h-4 w-4 text-navy-400" />© 2026 Brume
          </div>
          <div className="flex items-center gap-5 text-sm font-medium text-navy-500">
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
            <Link href="/disclosure" className="transition-colors hover:text-ink">
              Disclosure
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy Policy
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
