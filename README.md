# Brume

Solana wallet as a Chrome MV3 extension, plus a Next.js API for portfolio, activity, and token metadata. Monorepo: **pnpm** workspaces + **Turborepo**.

## Monorepo Structure

| Package | Path | Role |
| --- | --- | --- |
| `brume-wallet` | `wallet/` | Extension - React UI, service worker, injected `window.solana` |
| `@brume/api` | `app/` | Next.js 15 - Helius DAS, Prisma + Supabase Postgres |
| `@brume/shared` | `shared/` | Types and constants for wallet + API |

## Prerequisites

- **Node.js** 20+
- **pnpm** 9.x (`corepack enable && corepack prepare pnpm@9 --activate`)
- **Chrome** (unpacked extension dev)

## Quick Start

```bash
git clone https://github.com/brume-wallet/brume-app.git brume && cd brume
pnpm install
pnpm build          # shared -> wallet + app
pnpm dev            # wallet Vite + API on http://localhost:3000
```

Load the extension: Chrome > `chrome://extensions` > Developer mode > **Load unpacked** > choose `wallet/dist` (after `pnpm dev` or `pnpm build` in `wallet/`).

Beta testers do not build from source. They follow [brume.cash/install](https://brume.cash/install), which loads the zip from the latest GitHub release.

## Commands

### Root

| Command | Effect |
| --- | --- |
| `pnpm install` | All workspace packages |
| `pnpm build` | Dependency order via `turbo.json` |
| `pnpm dev` | Parallel dev tasks |
| `pnpm lint` | All linters |

### Wallet (`/wallet`)

```bash
pnpm dev            # hot reload
pnpm build          # production -> dist/
pnpm package        # build + release/brume-wallet-v<version>.zip for a GitHub release
```

### Wallet Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `VITE_POSTHOG_KEY` | No | PostHog project key (US cloud). Empty means analytics is off. When set, users must still opt in (Welcome screen or Settings > Beta). |
| `VITE_BRUME_API_ORIGIN` | No | API origin. Empty means `https://brume.cash`. Set it in `.env.development` for a local API. |

### Beta analytics events

Sent only after opt-in. No addresses, amounts, or signatures. Seed, key, and password screens carry `ph-no-capture` and are not recorded.

| Event | When |
| --- | --- |
| `app_opened` | Popup or side panel opens |
| `onboarding_completed` | New vault created or imported (`method`: `create`, `import_seed`, `import_key`) |
| `wallet_unlocked` | Unlock succeeds |
| `shield_succeeded` / `unshield_succeeded` | Shield or unshield lands (`mint`) |
| `shield_failed` / `unshield_failed` | Shield or unshield throws (`mint`) |
| `send_succeeded` | SOL or SPL send lands |
| `dapp_connect_approved` / `dapp_sign_approved` | User approves a dApp request |

Activation funnel in PostHog: `onboarding_completed` → `shield_succeeded` → `unshield_succeeded`, conversion window 7 days. The person property `first_open_at` holds the first time the extension opened.

### dApp connection

The injected script registers Brume through the [Wallet Standard](https://github.com/wallet-standard/wallet-standard) (`standard:connect`, `standard:events`, `solana:signAndSendTransaction`, `solana:signTransaction`, `solana:signMessage`) and also sets the legacy `window.solana` / `window.brume`. Every connect or sign request opens an approval window; a locked wallet shows Unlock first. Closing that window rejects the request. `signAndSendTransaction` sends on the wallet's current network and refuses a request for another cluster. When the user switches account or revokes a site, connected pages get a `change` event (`accountChanged` on the legacy provider).

### API (`/app`)

```bash
cp .env.example .env.local    # fill values below
pnpm db:push                  # schema to Postgres (needs DIRECT_URL)
pnpm dev                      # :3001
```

## API Environment Variables

| Variable | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Supabase **pooler** (port 6543, `pgbouncer=true`) |
| `DIRECT_URL` | For `db push` | **Direct** Postgres (port 5432, user `postgres`) |
| `HELIUS_API_KEY` | No | DAS + richer history; else public RPC |
| `DEVNET_RPC_URL` / `MAINNET_RPC_URL` | No | Override defaults |

Password in URLs must be percent-encoded. Pooler URL differs from direct - see [Supabase connection docs](https://supabase.com/docs/guides/database/connecting-to-postgres).

## API Routes

| Path | Method | Purpose |
| --- | --- | --- |
| `/api/health` | GET | Checks the mainnet and devnet RPC upstreams; `200` or `503` (see [RUNBOOK.md](RUNBOOK.md)) |
| `/api/rpc?network=<id>` | POST | RPC proxy for the wallet (mainnet goes through it) |
| `/api/tokens/portfolio?owner=<address>` | GET | Balances + metadata |
| `/api/tokens/metadata/<mint>` | GET | Single mint metadata |
| `/api/activity/<address>` | GET | Parsed transaction history |
| `/api/waitlist` | POST | Waitlist email signup |

There is no CORS layer: the extension reaches the API through its `https://brume.cash/*` host permission. `/api/rpc` allows 300 call units per minute per IP (`RPC_PROXY_CALLS_PER_MINUTE`). Routes that accept `rpcUrl` use it only when it is a public HTTPS host.

## Layout

```
app/          Next.js API and landing page, Prisma, src/app/api/*
wallet/       manifest, Vite, src/{background,content,popup,...}
shared/       src/* types & constants
turbo.json    task graph
pnpm-workspace.yaml
```

## Tests

```bash
cd wallet
pnpm test                    # unit tests
pnpm build && pnpm test:e2e  # 20 browser checks on dist/: session survives worker restart, Wallet Standard connect/sign, approval window, unlock-first
```

Manual smoke test: create wallet > devnet > airdrop > shield > unshield > send > connect and sign on the [wallet-adapter example](https://anza-xyz.github.io/wallet-adapter/example/) > lock/unlock.

## Troubleshooting

- **Service worker error (e.g. code 15)** - `chrome://extensions` > Errors on the extension card; after git pull: `pnpm install`, rebuild, reload extension.
- **`process is not defined` in wallet** - Node-only dep in the bundle; wallet should use browser-safe crypto (`@noble/*`, `@scure/*`). Check `vite.config.ts` aliases/defines.
- **Wallet cannot reach a local API** - Run the API with `cd app && pnpm dev` (port 3000) and put `VITE_BRUME_API_ORIGIN=http://localhost:3000` in `wallet/.env.development`. Dev builds add localhost host permissions; release builds do not.

## Security

Non-audited beta wallet. Do not use mainnet funds you cannot afford to lose. dApp origin comes from `chrome.runtime.MessageSender`, not page-controlled strings. Findings, fixes, and dated follow-ups: [SECURITY_REVIEW.md](SECURITY_REVIEW.md). Operations: [RUNBOOK.md](RUNBOOK.md).

## Canonical Q&As

These are the brand-facing answers kept consistent across the codebase and any public-facing copy. When an answer changes, update all locations in the same commit.

### Privacy

Source of truth for privacy claims: `shared/src/content/disclosure.ts` (shown at [brume.cash/disclosure](https://brume.cash/disclosure) and in the extension). If an answer here disagrees with it, the disclosure wins.

**Is Brume a mixer?**
No. Shield moves tokens between your wallet and a vault (a Smart Account) that only your key controls. It does not shuffle or tumble funds.

**What does Shield hide today?**
Nothing on-chain. The vault is a normal account: its balance, the link from your wallet to the vault, and every shield, unshield, and vault send are publicly visible. Shield keeps funds apart from your main wallet balance. Private balances and transfers are on the roadmap.

**Is Solana anonymous by default?**
No. Every Solana transaction - sender, recipient, amount, token - is written to a public ledger and indexed by chain analytics within seconds.

**Is Shield available on mainnet?**
Yes. Shield and unshield work on Solana Mainnet and Devnet. On Mainnet, shielded balances are real funds.

### Agents (roadmap, not built)

Agent policies are not in the current release. These answers describe the planned design.

**What stops an agent from sending everything?**
Policies. An agent with a 5 SOL per day spend limit cannot move 6 SOL regardless of what it is instructed to do. Spend limits and approval gates are enforced at the policy layer, not by trusting the agent.

**What controls do I have over an agent?**
Four controls: a hard spend cap per transaction, a hard cap per day, an approval gate for anything above your threshold, and instant revoke. Revoke takes effect immediately with no cooldown.

**What does the audit trail show?**
Every action an agent takes is labeled and logged. Nothing your wallet does on behalf of an agent happens without a record you can review.

### Wallet and custody

**Who holds my keys?**
You do. Keys are encrypted and stored in your browser's local extension storage. Brume never has access to your private keys.

**Does Brume work with any Solana dApp?**
With dApps that support the Wallet Standard, which includes apps built on `@solana/wallet-adapter`. Brume also sets the legacy `window.solana`.

**What wallets can I import?**
You can generate a new HD wallet with a 12 or 24-word seed phrase, or import an existing wallet by seed phrase or private key. Multiple accounts under the same seed phrase are supported.

## License

No root license file yet - add one before publishing.
