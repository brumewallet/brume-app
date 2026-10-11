# Brume API Runbook

The wallet needs `https://brume.cash` (Next.js on Vercel) for portfolio, activity, NFTs, and every mainnet RPC call (`/api/rpc`). Devnet sends go to `rpc.magicblock.app` directly. If the API is down, mainnet balances and sends stop working.

## Monitoring

- **Health endpoint:** `GET https://brume.cash/api/health`. It returns `200` when every upstream answers and `503` when one does not. The body shows each check:

  ```json
  {"ok":true,"checks":{"mainnetRpc":{"ok":true,"ms":197},"devnetRpc":{"ok":true,"ms":75}}}
  ```

- **Uptime check:** `.github/workflows/health.yml` calls the endpoint every 10 minutes (GitHub can start it a few minutes late). On failure it opens one issue titled **API down: brume.cash/api/health**, and GitHub emails repo watchers. It closes that issue when the check passes again.
- **Run it now:** Actions → API health → Run workflow, or `gh workflow run health.yml`.

## When the check fails

1. **Look at the failing check** in the issue or with `curl -s https://brume.cash/api/health`.
2. **Every request fails (5xx or timeout):** the deployment is down.
   - Vercel dashboard → project → Deployments: check that the latest production deployment is "Ready".
   - If the last deploy broke it: on that page, choose an older Ready deployment → **Promote to Production**. This is instant and changes no code.
   - Check https://www.vercel-status.com.
3. **Only `mainnetRpc` fails:** the Helius key or quota is the cause.
   - Helius dashboard: check the key is active and the credit quota is not used up.
   - Short-term fix: in Vercel → Settings → Environment Variables, set `MAINNET_RPC_URL` to another provider's mainnet URL, then redeploy. `MAINNET_RPC_URL` takes priority over Helius.
4. **Only `devnetRpc` fails:** devnet itself is often unstable. Check https://status.solana.com. To override, set `DEVNET_RPC_URL`.
5. **Rate limits:** `/api/rpc` allows 300 call units per minute per IP (some methods cost more than 1). To change it, set `RPC_PROXY_CALLS_PER_MINUTE`. The limit is kept in memory per server instance, so it resets when Vercel starts a new instance. A tester who sees "Too many requests" should wait a minute.

## Tell testers

Post in the beta channel: what is broken (for example, "mainnet balances do not load"), that their funds are safe (keys never leave their device), and when you will update next. Close the loop when it is fixed.

## Environment variables (Vercel)

| Variable | Purpose |
| --- | --- |
| `HELIUS_API_KEY` | Mainnet RPC upstream and NFT (DAS) lookups |
| `MAINNET_RPC_URL` / `DEVNET_RPC_URL` | Optional upstream overrides; they take priority over the defaults |
| `RPC_PROXY_CALLS_PER_MINUTE` | Per-IP limit for `/api/rpc` (default 300) |
| `DATABASE_URL` / `DIRECT_URL` | Prisma. No route reads the database yet |
