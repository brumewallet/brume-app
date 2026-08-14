import type { Metadata } from "next";
import Link from "next/link";
import { DISCLOSURE_ITEMS, type DisclosureItem } from "@brume/shared";
import { BrumeMark, BrumeWordmark } from "@/components/marketing/logo";

export const metadata: Metadata = {
  title: "Privacy Disclosure · Brume",
  description:
    "What Brume keeps private, what is visible on-chain, and the trust assumptions of Phase 1. Plain language, no fine print.",
};

const STATE_GROUPS: { state: DisclosureItem["state"]; heading: string; dot: string }[] = [
  { state: "private", heading: "What is private", dot: "bg-[#7B6BFF]" },
  { state: "public", heading: "What is public", dot: "bg-[#F0A458]" },
  { state: "trust", heading: "Trust assumptions", dot: "bg-navy-400" },
  { state: "roadmap", heading: "Roadmap", dot: "bg-navy-400" },
];

const STATE_BADGE: Record<DisclosureItem["state"], string> = {
  private: "bg-[#7B6BFF]/15 text-[#7B6BFF]",
  public: "bg-[#F0A458]/15 text-[#F0A458]",
  trust: "bg-navy-100 text-navy-500",
  roadmap: "bg-navy-100 text-navy-500",
};

const STATE_LABEL: Record<DisclosureItem["state"], string> = {
  private: "Private",
  public: "Public",
  trust: "Trust",
  roadmap: "Roadmap",
};

function DisclosureRow({ item }: { item: DisclosureItem }) {
  return (
    <div className="flex flex-col gap-3 border-t hairline py-7 sm:flex-row sm:gap-8">
      <div className="flex shrink-0 flex-col gap-2 sm:w-52">
        <span
          className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${STATE_BADGE[item.state]}`}
        >
          {STATE_LABEL[item.state]}
        </span>
        <p className="font-display text-base tracking-tightest text-ink">{item.label}</p>
      </div>
      <p className="leading-relaxed text-navy-500 sm:flex-1">{item.body}</p>
    </div>
  );
}

export default function DisclosurePage() {
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
            href="/privacy"
            className="text-sm font-medium text-navy-500 transition-colors hover:text-ink"
          >
            Privacy Policy
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full glass-soft px-3.5 py-1.5 text-xs font-medium text-navy-500">
            <span className="h-1.5 w-1.5 rounded-full bg-ube-400" />
            Disclosure
          </span>
          <h1 className="mt-5 font-display text-[clamp(2.25rem,5vw,3.25rem)] tracking-tightest text-ink">
            What Brume hides. What it cannot.
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-navy-500">
            Privacy has real limits. This page names them plainly so you can
            decide what to trust. If an entry is missing or wrong, it is a
            bug - file it.
          </p>
        </div>

        <div className="mt-14 max-w-3xl">
          {STATE_GROUPS.map(({ state, heading, dot }) => {
            const items = DISCLOSURE_ITEMS.filter((i) => i.state === state);
            if (items.length === 0) return null;
            return (
              <section key={state} className="mb-12">
                <div className="flex items-center gap-2.5">
                  <span className={`h-2 w-2 rounded-full ${dot}`} />
                  <h2 className="font-display text-xl tracking-tightest text-ink sm:text-2xl">
                    {heading}
                  </h2>
                </div>
                <div>
                  {items.map((item) => (
                    <DisclosureRow key={item.id} item={item} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <div className="mt-4 max-w-3xl rounded-2xl border-l-2 border-ube-400 glass p-5">
          <p className="font-semibold leading-relaxed text-ink">
            This disclosure and the wallet implementation move together.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-navy-500">
            If a code change shifts what leaks, this page updates in the same
            release. It is machine-readable at{" "}
            <code className="rounded bg-navy-100 px-1 py-0.5 text-xs text-navy-700">
              @brume/shared
            </code>
            .
          </p>
        </div>
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
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
