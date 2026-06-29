import Link from "next/link";
import { BrumeWordmark, BrumeMark } from "@/components/marketing/logo";
import type { LegalBlock, LegalDoc } from "./data";

function Block({ block }: { block: LegalBlock }) {
  switch (block.type) {
    case "p":
      return <p className="mt-4 leading-relaxed text-navy-500">{block.text}</p>;
    case "subheading":
      return (
        <h3 className="mt-7 font-display text-lg tracking-tightest text-ink">
          {block.text}
        </h3>
      );
    case "list":
      return (
        <ul className="mt-4 space-y-2.5">
          {block.items.map((item) => (
            <li key={item} className="flex gap-3 leading-relaxed text-navy-500">
              <span
                aria-hidden
                className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ube-400"
              />
              {item}
            </li>
          ))}
        </ul>
      );
    case "callout":
      return (
        <div className="mt-5 rounded-2xl border-l-2 border-ube-400 glass p-5 pl-5">
          <p className="font-semibold leading-relaxed text-ink">{block.text}</p>
        </div>
      );
  }
}

export function LegalPage({
  doc,
  other,
}: {
  doc: LegalDoc;
  other: { href: string; label: string };
}) {
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
            href={other.href}
            className="text-sm font-medium text-navy-500 transition-colors hover:text-ink"
          >
            {other.label}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full glass-soft px-3.5 py-1.5 text-xs font-medium text-navy-500">
            <span className="h-1.5 w-1.5 rounded-full bg-ube-400" />
            Legal
          </span>
          <h1 className="mt-5 font-display text-[clamp(2.25rem,5vw,3.25rem)] tracking-tightest text-ink">
            {doc.title}
          </h1>
          <p className="mt-3 text-sm font-medium text-navy-400">
            Effective {doc.effectiveDate} · Version {doc.version}
          </p>
          <p className="mt-5 text-lg leading-relaxed text-navy-500">
            {doc.summary}
          </p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[210px_minmax(0,1fr)] lg:gap-12">
          <aside className="lg:sticky lg:top-8 lg:self-start">
            <nav aria-label="On this page" className="lg:block">
              <details className="group rounded-2xl glass p-2" open>
                <summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-wide text-navy-400 lg:cursor-default">
                  On this page
                </summary>
                <ul className="mt-1 space-y-0.5">
                  {doc.sections.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block rounded-xl px-3 py-1.5 text-sm text-navy-500 transition-colors hover:bg-ube-100/70 hover:text-ink"
                      >
                        {s.heading}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </nav>
          </aside>

          <div className="max-w-2xl">
            {doc.sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                className="scroll-mt-24 border-t hairline pt-10 first:border-t-0 first:pt-0"
              >
                <h2 className="font-display text-xl tracking-tightest text-ink sm:text-2xl">
                  {section.heading}
                </h2>
                {section.blocks.map((block, i) => (
                  <Block key={i} block={block} />
                ))}
              </section>
            ))}

            <div className="mt-12 flex flex-col gap-3 rounded-2xl glass p-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-navy-500">
                Looking for the {other.label.toLowerCase()}?
              </p>
              <Link
                href={other.href}
                className="press inline-flex items-center self-start rounded-full bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-navy-900"
              >
                {other.label}
              </Link>
            </div>
          </div>
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
              Privacy
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
