import type { Metadata } from "next";
import Link from "next/link";
import { BRUME_FEEDBACK_URL, BRUME_GITHUB_REPO_URL, BRUME_RELEASES_URL } from "@brume/shared";
import { BrumeMark, BrumeWordmark } from "@/components/marketing/logo";

export const metadata: Metadata = {
  title: "Install Brume Beta · Brume",
  description:
    "Load the Brume wallet extension in Chrome in three steps. Runs on Solana Mainnet and Devnet.",
};

const STEPS = [
  {
    n: "01",
    heading: "Download the latest release",
    body: (
      <>
        Go to{" "}
        <a
          href={BRUME_RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-ube-600 underline-offset-2 hover:underline"
        >
          the latest GitHub release
        </a>{" "}
        and download the <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">brume-wallet-*.zip</code> asset.
        Unzip it to a folder that you will keep. Chrome loads the extension from that folder.
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
        Click <strong>Load unpacked</strong> and select the folder that you unzipped (it
        contains <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">manifest.json</code>).
      </>
    ),
  },
  {
    n: "03",
    heading: "Set up and try Shield",
    body: (
      <>
        Pin Brume to the toolbar. Open the extension and create or import a wallet. To
        test with no real funds, go to <strong>Settings → Network → Devnet</strong> and
        request an airdrop. Then open the <strong>Shield</strong> tab: shield a token into
        your vault, then unshield it back. Read the{" "}
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
            Beta · Mainnet &amp; Devnet
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
          <p className="font-semibold text-ink">Mainnet uses real funds.</p>
          <p className="mt-1 text-sm leading-relaxed text-navy-500">
            Brume runs on Solana Mainnet and Devnet. Switch networks in Settings. Shield uses a
            Brume vault; shielded balances are visible on-chain.
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

        <section className="mt-16 max-w-2xl rounded-2xl glass p-6 sm:p-8">
          <h2 className="font-display text-xl tracking-tightest text-ink sm:text-2xl">
            Updating and feedback
          </h2>
          <ul className="mt-4 list-disc space-y-2 pl-5 leading-relaxed text-navy-500">
            <li>
              To update, download the new release, replace the files in the same folder, and
              click the reload icon on the Brume card in{" "}
              <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">chrome://extensions</code>.
              Your wallet stays on your device.
            </li>
            <li>
              dApps that support the Wallet Standard list Brume in their wallet picker. Each
              connect or sign request opens a Brume approval window.
            </li>
            <li>
              On the welcome screen you can opt in to share usage events and screen recordings.
              It is off by default. See the{" "}
              <Link href="/disclosure" className="font-medium text-ube-600 underline-offset-2 hover:underline">
                disclosure
              </Link>{" "}
              for what that includes.
            </li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={BRUME_FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center rounded-full bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-navy-900"
            >
              Send feedback
            </a>
            <a
              href={BRUME_GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center rounded-full glass hairline px-5 py-2.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5"
            >
              Source on GitHub
            </a>
          </div>
        </section>
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
