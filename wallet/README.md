# Brume Wallet (Solana browser extension)

Chrome **Manifest V3** wallet: React popup, service-worker background, injected `window.solana` provider. Crypto primitives align with [`../docs/SOLANA_WALLET.md`](../docs/SOLANA_WALLET.md) (PBKDF2 + AES-GCM keystore, BIP39/BIP44, approval queue, origin checks).

## Prerequisites

- Node 20+
- pnpm

## Develop

```bash
cd wallet
pnpm install
pnpm dev
```

Then open **Chrome → Extensions → Developer mode → Load unpacked** and select the **`wallet/dist`** folder (after the first dev build completes, or run `pnpm build` once).

- **Popup:** right-click the extension icon → Inspect popup.
- **Service worker:** Extensions page → “Service worker” link under Brume.

### Manifest: dev vs production

Keep **`manifest.json` in the repo** pointing at TypeScript entries (`src/background/index.ts`, `src/content/bridge.ts`). Do not paste `dist/manifest.json` over it.

After **`pnpm dev`**, `dist/manifest.json` is rewritten for HMR: the content script is often `src/content/bridge.ts-loader.js`, and `web_accessible_resources` may list broad patterns (`**/*`, `*`, `<all_urls>`). That is normal while the Vite dev server is running.

After **`pnpm run build`**, `dist/manifest.json` uses hashed bundles under `assets/` and a **narrower** `web_accessible_resources` list. Use that output for a production-like unpacked load or store submission.

## Build

```bash
pnpm run build
```

Output: `dist/` (load this folder as unpacked).

## Manual smoke test

1. Create wallet → verify phrase order → set password.
2. On **Devnet**, tap **Airdrop** (1 SOL).
3. **Send** a small amount to another address; open the explorer link.
4. Open any **https** page; in DevTools console: `await window.solana.connect()` → approve in the extension popup when prompted.
5. **Lock** / **Unlock** with password.

## Troubleshooting

### Service worker registration failed (status code: 15)

Usually means the background script threw while loading (open **Errors** on the extension card, or **Inspect views: service worker**). A common cause was **`ReferenceError: process is not defined`** from Node-oriented dependencies in the worker. This project avoids that by deriving keys with **`@noble/hashes`** (see `src/shared/slip10-ed25519.ts`) instead of `ed25519-hd-key` / `Buffer`.

After pulling changes, run **`pnpm install`**, **`pnpm run build`**, then **Reload** the extension on `chrome://extensions`.

## Security notes

- This is a **development / learning** wallet. Do not use for mainnet funds without a full security review.
- dApp `origin` is taken from `chrome.runtime.MessageSender.tab`, not from page-supplied strings.

## Project layout

- `src/background/` - keystore, RPC, signing, approvals, persistence.
- `src/content/` - bridge + main-world `injected` script (`?script&module` via CRXJS).
- `src/popup/` - UI (HashRouter, 360×600 layout).
- `src/shared/` - types, keystore, wallet-core, crypto helpers.
