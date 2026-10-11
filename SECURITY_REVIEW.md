# Security Review: Extension Risk Surface

**Date:** 2026-10-11
**Scope:** the Chrome MV3 extension (`wallet/`), its message paths to web pages, key storage, and the API it depends on (`app/`).
**Method:** code review of every message handler, the content script and injected provider, key storage, the manifest, and the API routes; `pnpm audit --prod`; an end-to-end browser test (`wallet/test/e2e/extension.e2e.mjs`, 20 checks).
**Status:** no critical issue is open. Open items are listed with a dated follow-up.

## Trust boundaries

```
web page ──postMessage──▶ content script (bridge.ts) ──runtime message──▶ service worker ◀── popup / side panel / approval window
                           forwards DAPP_* only                       holds the unlocked keys
```

- A web page can only reach the wallet through the content script, which forwards `DAPP_*` requests. The page origin comes from `sender.tab.url` (set by Chrome), not from the page.
- Every sign request needs a user click in a Brume window. Connect needs a click unless the user allowlists the site.
- Keys are encrypted at rest (AES-256-GCM, PBKDF2-SHA256) in `chrome.storage.local`. When unlocked, they are in `chrome.storage.session` (memory only, extension contexts only).

## Fixed in this review

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | Critical | The released wallet sent all API and **mainnet RPC** traffic to `http://localhost:3000` (`DEFAULT_BRUME_API_ORIGIN`, changed 2026-07-04). Balances, activity, and mainnet sends failed for every tester. | Default is `https://brume.cash`. Local dev uses `VITE_BRUME_API_ORIGIN`. |
| 2 | Critical | Next.js 15.5.19 had unauthenticated RCE (image optimizer) and SSRF advisories. | Upgraded to 15.5.27. |
| 3 | High | `EXPORT_SECRET` returned the private key with no password whenever the wallet was unlocked. The account "Private key" screen had no password field. | The background always requires and checks the password. The screen asks for it. |
| 4 | High | Five API routes fetched a client-supplied `rpcUrl` on the server (SSRF to localhost, private networks, cloud metadata). | `rpcUrlFromParam` allows only public HTTPS hosts and falls back to the default RPC otherwise. 22 unit tests. |
| 5 | High | The unlocked key lived in a worker variable. Chrome stops idle MV3 workers after about 30 s, so the wallet locked itself and dApp signs failed. | Session is kept in `chrome.storage.session` with `TRUSTED_CONTEXTS`. Verified: still unlocked after 40 s idle. |
| 6 | Medium | Wallet-control messages (`EXPORT_SECRET`, `POPUP_APPROVE_SIGN`, `UNLOCK`, …) were accepted from any sender context. | `isAllowedSender`: only Brume extension pages may send non-`DAPP_*` messages. |
| 7 | Medium | Host permissions included `*.vercel.app`, `localhost`, and 8 unused hosts. The `scripting` permission was unused. The content script ran on `http://` pages. Extension pages could load `http:` images. | Release manifest has 6 hosts. Dev builds add localhost. Content script runs on `https://` pages plus localhost only. `http:` removed from `img-src`. |
| 8 | Medium | PBKDF2 used 100k iterations. Decrypt ignored the stored count. | New keystores use 600k. Decrypt reads the stored count, so old wallets still open. |
| 9 | Medium | dApp connect and sign requests set only a badge. Users did not see the request, and the dApp could wait with no answer. | An approval window opens. A locked wallet shows Unlock first. Closing the window rejects the request. |
| 10 | Low | `/api/nfts` logged the first 8 characters of the Helius API key. | Log line removed. |
| 11 | Low | `react-router` 7.14 advisories. `shadcn` (a CLI) was a production dependency of the wallet, pulling in `express`. | `react-router-dom` 7.18.4. `shadcn` moved to `devDependencies`. |

Audit result after fixes: 0 critical, 25 high (was 3 critical, 45 high). See open item O-7.

## Open items (scoped, with follow-up dates)

| # | Severity | Finding | Why it is not fixed now | Follow-up |
|---|---|---|---|---|
| O-1 | High | **Blind signing.** The sign screen decodes only SOL transfers. Other transactions show the program count, with no simulation or balance-change preview. | Needs `simulateTransaction` plus a balance-diff view; real UI work. Testers use known reference dApps during the beta. | Simulation + balance changes on the approval screen by **2026-10-25** |
| O-2 | Medium | Wallets created before this review keep 100k PBKDF2 iterations. | Needs a re-encrypt-on-unlock migration with care for multi-account vaults. | Migrate on next unlock by **2026-10-25** |
| O-3 | Medium | `/api/waitlist` does not store signups. It writes the email to the server log (personal data in logs; signups are lost). | Needs a storage decision (Prisma table or email provider). | Store it or remove the form, and stop logging the email, by **2026-10-18** |
| O-4 | Medium | The RPC URL check blocks private IP literals but not DNS names that resolve to private IPs (DNS rebinding). | Low risk on Vercel's serverless network; a full fix needs resolve-then-pin. | Resolve and check the IP, or allowlist RPC providers, by **2026-11-08** |
| O-5 | Medium | The API rate limiter is in memory per serverless instance, so it resets on cold starts and is per instance. | Needs a shared store (for example, Upstash Redis). | Shared rate limiter by **2026-11-08** |
| O-6 | Low | The vault password is kept in `chrome.storage.session` while unlocked (needed to add accounts without asking again). | Same exposure as the unlocked keys in the same store. Cleared on lock, auto-lock, and browser close. | Accepted for beta; review at mainnet hardening, **2026-12-01** |
| O-7 | Low | 25 high transitive advisories remain: Prisma CLI tooling (`fast-uri`, `hono`, `mysql2`), Next's internal `postcss`/`sharp`, `ws` via `@solana/web3.js`, and `bigint-buffer` (no fixed version) via the Loyal SDK. | Not reachable from user input in the shipped extension, or build-time only. No upstream fix for some. | Re-run `pnpm audit --prod` with each release; next pass **2026-10-25** |
| O-8 | Low | No limit on unlock attempts. | The real threat is an offline attack on the stored keystore, which PBKDF2 slows. | Add a delay after repeated failures by **2026-11-08** |

## Trust assumptions (also on the disclosure page)

- The Squads Smart Account program and its upgrade authority (Shield vault).
- The Loyal SDK packages (`@loyal-labs/*`, unaudited, pinned to exact versions).
- PostHog receives events and recordings only after opt-in. Seed, key, and password screens carry `ph-no-capture`, and all inputs are masked.
- The non-audited beta warning stays on the landing page and the install page.

## How to re-check

```bash
cd wallet && pnpm test            # unit tests: sender guard, keystore, session store, RPC URL check, Wallet Standard
pnpm build && pnpm test:e2e       # 20 browser checks against dist/
cd .. && pnpm audit --prod
```
