import Link from "next/link";
import { BRUME_FEEDBACK_URL, BRUME_GITHUB_REPO_URL } from "@brume/shared";
import { Reveal } from "@/components/marketing/reveal";
import { Waitlist } from "@/components/marketing/waitlist";
import { BrumeMark, BrumeWordmark } from "@/components/marketing/logo";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Disclosure", href: "/disclosure" },
  { label: "Roadmap", href: "#roadmap" },
] as const;

const TRUST = [
  "Separate shielded balance",
  "Non-custodial",
  "Mainnet and Devnet",
  "Open source",
] as const;

// Not built yet. Keep this list in the roadmap section only.
const ROADMAP = ["Private transfers", "Agent spend policies", "DCA", "Staking"] as const;

function MeshBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 bg-white" aria-hidden />
  );
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 px-4 pt-safe sm:px-6">
      <div className="mx-auto mt-3 flex h-14 max-w-6xl items-center justify-between gap-3 rounded-full glass px-3 pl-5 sm:mt-4">
        <a href="#top" className="press" aria-label="Brume home">
          <BrumeWordmark />
        </a>
        <nav className="hidden items-center gap-0.5 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.label}
              href={l.href}
              className="rounded-full px-3.5 py-2 text-sm text-navy-500 transition-colors hover:bg-ube-100/70 hover:text-ink"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <Link
          href="/install"
          className="press inline-flex shrink-0 items-center rounded-full bg-navy-800 px-5 py-2.5 text-sm font-semibold text-white shadow-primary transition hover:-translate-y-0.5 hover:bg-navy-900"
        >
          Install beta
        </Link>
      </div>
    </header>
  );
}

function WalletCard() {
  return (
    <div>
      <div className="glass hairline relative w-full max-w-sm rounded-[1.75rem] p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-navy-900 text-white">
              <BrumeMark className="h-5 w-5" />
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold text-ink">Main</div>
              <div className="flex items-center gap-1.5 text-xs text-navy-400">
                <span className="h-1.5 w-1.5 rounded-full bg-ube-400" />
                7xKq…9fne · Shielded
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7">
          <div className="text-xs font-semibold uppercase tracking-wide text-navy-400">
            Total balance
          </div>
          <div className="mt-1 flex items-end gap-2">
            <span className="sr-only">Balance hidden for privacy</span>
            <span
              aria-hidden
              className="font-display text-4xl tracking-tightest text-ink"
            >
              ••••••
            </span>
            <span className="pb-1.5 text-sm text-navy-400">USD</span>
          </div>
        </div>

        <div className="mt-6 space-y-2.5">
          {[
            { sym: "SOL", name: "Solana" },
            { sym: "USDC", name: "USD Coin" },
          ].map((a) => (
            <div
              key={a.sym}
              className="flex items-center justify-between rounded-2xl border bg-white/55 px-3.5 py-3 hairline"
            >
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ube-100 text-xs font-semibold text-navy-700">
                  {a.sym[0]}
                </span>
                <div className="leading-tight">
                  <div className="text-sm font-semibold text-ink">{a.sym}</div>
                  <div className="text-xs text-navy-400">{a.name}</div>
                </div>
              </div>
              <span className="sr-only">amount hidden</span>
              <span aria-hidden className="text-sm text-navy-300">
                ••••
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2 rounded-2xl bg-navy-900/[0.05] px-3.5 py-3">
          <span className="text-xs text-navy-600">
            Shielded vault ·{" "}
            <span className="font-semibold text-ink">only your key signs</span>
          </span>
          <span className="ml-auto text-xs font-semibold text-ube-600">
            Unshield
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div id="top" className="relative min-h-screen overflow-x-hidden">
      <MeshBackground />
      <Nav />

      <main>
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-32 sm:px-6 sm:pt-40 lg:pb-28 lg:pt-44">
          <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8">
            <div className="max-w-2xl">
              <Reveal>
                <h1 className="font-display text-[clamp(1.75rem,6.2vw,3.8rem)] leading-[1.0] tracking-tightest text-ink sm:whitespace-nowrap">
                  The wallet that tells you
                  <br />
                  what is public.
                </h1>
              </Reveal>

              <Reveal delay={120}>
                <p className="mt-6 max-w-md text-lg leading-relaxed text-navy-500">
                  A Solana wallet with a shielded balance that only your key
                  controls. Shield and unshield in one tap, connect to dApps,
                  and read exactly what stays visible on-chain today.
                </p>
              </Reveal>

              <Reveal delay={220}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    href="/install"
                    className="press inline-flex items-center justify-center rounded-full bg-navy-800 px-7 py-3.5 text-sm font-semibold text-white shadow-primary transition hover:-translate-y-0.5 hover:bg-navy-900"
                  >
                    Install the beta
                  </Link>
                  <Link
                    href="/disclosure"
                    className="press inline-flex items-center justify-center rounded-full glass hairline px-7 py-3.5 text-sm font-semibold text-ink transition hover:-translate-y-0.5 hover:bg-white/80"
                  >
                    What is private today
                  </Link>
                </div>
              </Reveal>

            </div>

            <Reveal delay={200} className="flex justify-center lg:justify-end">
              <WalletCard />
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-5 sm:px-6">
          <Reveal>
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-4xl glass hairline md:grid-cols-4">
              {TRUST.map((label) => (
                <li
                  key={label}
                  className="px-5 py-5 text-sm font-semibold text-ink"
                >
                  {label}
                </li>
              ))}
            </ul>
          </Reveal>
        </section>

        <section
          id="features"
          className="mx-auto max-w-6xl px-5 pt-28 sm:px-6 sm:pt-36"
        >
          <Reveal as="header" className="max-w-2xl">
            <h2 className="font-display text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.02] tracking-tightest text-ink">
              Honest about what is private.
            </h2>
            <p className="mt-4 text-lg leading-relaxed text-navy-500">
              Most wallets do not tell you what leaks. Brume names it. Today,
              Shield keeps funds apart from your main wallet. It does not hide
              balances or amounts yet, and our disclosure says so.
            </p>
          </Reveal>

          <div className="mt-12 grid gap-4 md:grid-cols-3 md:auto-rows-[minmax(0,1fr)]">
            <Reveal className="md:col-span-2 md:row-span-2">
              <article className="relative flex h-full flex-col justify-between overflow-hidden rounded-[1.75rem] glass hairline p-8 transition duration-300 ease-out hover:-translate-y-1 hover:shadow-glass-lift sm:p-10">
                <div className="relative z-10 max-w-md">
                  <span className="font-display text-2xl tracking-tightest text-ube-400">
                    01
                  </span>
                  <h3 className="mt-5 font-display text-2xl tracking-tightest text-ink sm:text-3xl">
                    Shield and unshield
                  </h3>
                  <p className="mt-3 leading-relaxed text-navy-500">
                    Move tokens from your main wallet into a vault that only your
                    key controls, and back again. One signer, no time lock. Works
                    on Solana Mainnet and Devnet.
                  </p>
                </div>
                <div
                  className="relative z-10 mt-10 flex flex-wrap items-center gap-2 text-sm text-navy-300"
                  aria-hidden
                >
                  {["shield 12.4 USDC → vault", "unshield → wallet", "1 signer", "no time lock"].map(
                    (t) => (
                      <span
                        key={t}
                        className="rounded-full border bg-white/60 px-3 py-1.5 hairline"
                      >
                        {t}
                      </span>
                    ),
                  )}
                </div>
              </article>
            </Reveal>

            <Reveal delay={80}>
              <article className="flex h-full flex-col rounded-[1.75rem] glass hairline p-7">
                <span className="font-display text-xl tracking-tightest text-ube-400">
                  02
                </span>
                <h3 className="mt-4 font-display text-xl tracking-tightest text-ink">
                  Works with Solana dApps
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-500">
                  Connect and sign on apps that support the Wallet Standard.
                  Every request opens an approval window before anything is
                  signed.
                </p>
                <Link
                  href="/install"
                  className="mt-4 inline-block text-sm font-semibold text-ube-600 transition duration-200 ease-out hover:translate-x-0.5 hover:text-navy-800"
                >
                  Install the beta
                </Link>
              </article>
            </Reveal>

            <Reveal delay={160}>
              <article className="flex h-full flex-col rounded-[1.75rem] glass hairline p-7">
                <span className="font-display text-xl tracking-tightest text-ube-400">
                  03
                </span>
                <h3 className="mt-4 font-display text-xl tracking-tightest text-ink">
                  Honest disclosure
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-navy-500">
                  Privacy has limits. One page lists what is private, what is
                  public, and what you must trust.
                </p>
                <Link
                  href="/disclosure"
                  className="mt-4 inline-block text-sm font-semibold text-ube-600 transition duration-200 ease-out hover:translate-x-0.5 hover:text-navy-800"
                >
                  Read the disclosure
                </Link>
              </article>
            </Reveal>
          </div>
        </section>

        <section
          id="roadmap"
          className="mx-auto max-w-6xl px-5 pt-28 sm:px-6 sm:pt-36"
        >
          <Reveal>
            <div className="flex flex-col gap-6 rounded-[1.75rem] glass hairline p-8 sm:p-10 md:flex-row md:items-center md:justify-between">
              <div className="max-w-md">
                <h2 className="font-display text-2xl tracking-tightest text-ink sm:text-3xl">
                  On the roadmap
                </h2>
                <p className="mt-2 text-navy-500">
                  Not built yet. We list them so you know where Brume is going,
                  not what it does today.
                </p>
              </div>
              <ul className="flex flex-wrap gap-2.5">
                {ROADMAP.map((m) => (
                  <li
                    key={m}
                    className="inline-flex items-center rounded-full border bg-white/60 px-4 py-2.5 text-sm font-medium text-ink transition duration-200 ease-out hover:-translate-y-0.5 hover:border-ube-300 hover:bg-white hairline"
                  >
                    {m}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </section>

        <section id="get" className="mx-auto max-w-6xl px-5 py-28 sm:px-6 sm:py-36">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.25rem] bg-navy-900 px-7 py-14 text-center sm:px-12 sm:py-20">
              <div
                className="pointer-events-none absolute inset-0 bg-star-field opacity-[0.05]"
                aria-hidden
              />
              <div className="relative z-10 mx-auto max-w-xl">
                <BrumeMark className="mx-auto h-10 w-10 text-ube-400" />
                <h2 className="mt-6 font-display text-[clamp(2rem,5vw,3.4rem)] leading-tight tracking-tightest text-white">
                  Try the beta.
                </h2>
                <p className="mx-auto mt-4 max-w-md text-ube-100">
                  Load the Chrome extension from the latest GitHub release. It
                  takes about a minute. Tell us what breaks.
                </p>
                <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/install"
                    className="press inline-flex items-center justify-center rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-navy-900 transition hover:-translate-y-0.5"
                  >
                    Install guide
                  </Link>
                  <a
                    href={BRUME_FEEDBACK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press inline-flex items-center justify-center rounded-full border border-white/20 px-7 py-3.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10"
                  >
                    Send feedback
                  </a>
                </div>
                <p className="mt-10 text-sm text-ube-100">
                  Or get release news by email.
                </p>
                <div className="mt-4">
                  <Waitlist />
                </div>
              </div>
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-5 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-6 border-t hairline pt-8 sm:flex-row sm:items-center">
          <div>
            <BrumeWordmark />
            <p className="mt-2 text-sm text-navy-400">
              Honest about privacy · brume.cash
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-medium text-navy-500">
            <Link href="/install" className="transition-colors hover:text-ink">
              Install
            </Link>
            <Link href="/disclosure" className="transition-colors hover:text-ink">
              Disclosure
            </Link>
            <a
              href={BRUME_GITHUB_REPO_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ink"
            >
              GitHub
            </a>
            <a
              href={BRUME_FEEDBACK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-ink"
            >
              Feedback
            </a>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy Policy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
        <p className="mt-8 text-xs text-navy-400">
          © 2026 Brume. Non-audited development wallet. Do not use mainnet funds
          you cannot afford to lose.
        </p>

        <div className="mt-14 overflow-hidden" aria-hidden>
          <svg viewBox="0 20 3300 690" className="block w-full" role="presentation">
            <text
              x="0"
              y="730"
              textLength="3300"
              lengthAdjust="spacingAndGlyphs"
              className="fill-ink font-display"
              style={{ fontSize: "1000px" }}
            >
              Brume
            </text>
          </svg>
        </div>
      </footer>
    </div>
  );
}
