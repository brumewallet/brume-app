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
pnpm dev            # wallet Vite + API on http://localhost:3001
```

Load the extension: Chrome > `chrome://extensions` > Developer mode > **Load unpacked** > choose `wallet/dist` (after `pnpm dev` or `pnpm build` in `wallet/`).

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
```

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
| `/api/health` | GET | Health check |
| `/api/tokens/portfolio?owner=<address>` | GET | Balances + metadata |
| `/api/tokens/metadata/<mint>` | GET | Single mint metadata |
| `/api/activity/<address>` | GET | Parsed transaction history |
| `/api/waitlist` | POST | Waitlist email signup |

CORS is restricted to the extension and known hosts. Rate limit: ~180 req/min per IP.

## Layout

```
app/          Next.js API and landing page, Prisma, src/app/api/*
wallet/       manifest, Vite, src/{background,content,popup,...}
shared/       src/* types & constants
turbo.json    task graph
pnpm-workspace.yaml
```

## Smoke Test

Create wallet > devnet > airdrop > send > on a `https://` page: `await window.solana.connect()` > lock/unlock.

## Troubleshooting

- **Service worker error (e.g. code 15)** - `chrome://extensions` > Errors on the extension card; after git pull: `pnpm install`, rebuild, reload extension.
- **`process is not defined` in wallet** - Node-only dep in the bundle; wallet should use browser-safe crypto (`@noble/*`, `@scure/*`). Check `vite.config.ts` aliases/defines.
- **403 / CORS on API** - Use API on `localhost:3001`; extension `host_permissions` must allow your dev origin.

## Security

Non-audited development wallet. Do not use mainnet funds you cannot afford to lose. dApp origin comes from `chrome.runtime.MessageSender`, not page-controlled strings.

## Canonical Q&As

These are the brand-facing answers kept consistent across the codebase and any public-facing copy. When an answer changes, update all locations in the same commit.

### Privacy

**Is Brume a mixer?**
No. The shielded balance feature moves tokens between your public wallet and a private balance. It does not shuffle or tumble funds. The shielding approach is bounded by Solana's public ledger - see the Privacy Limits section in the docs for what is and is not protected.

**What does "privacy by default" mean?**
When you send through the Shield path, your public wallet balance does not appear in the on-chain trace to the recipient. Privacy is the default flow, not an opt-in. Transparent transfers are still available if you need them.

**Is Solana anonymous by default?**
No. Every Solana transaction - sender, recipient, amount, token - is written to a public ledger and indexed by chain analytics within seconds. Brume's shield feature is what adds a private path on top of that.

**Is Shield available on mainnet?**
Not during the current phase. Shield is supported on Solana devnet while the feature is in early development. Mainnet support is on the roadmap.

### Agents

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
Yes. Brume injects `window.solana` and implements the standard wallet adapter interface. Any dApp that supports Solana wallet adapters will work.

**What wallets can I import?**
You can generate a new HD wallet with a 12 or 24-word seed phrase, or import an existing wallet by seed phrase or private key. Multiple accounts under the same seed phrase are supported.

## License

No root license file yet - add one before publishing.
