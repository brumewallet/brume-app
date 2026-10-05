// Kamino's API reads real mainnet, where fork-only vaults are empty; this makes its deposit bundles match fork state.
import { Connection, PublicKey } from "@solana/web3.js";

const KAMINO_MARKET = new PublicKey("7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF");
const KAMINO_LEND = new PublicKey("KLend2g3cP87fffoy8q1mQqGKjrxjC8boSyAYavgmjD");
const USDC_RESERVE = "D6q6wuQSrifJKZYpR1M8R4YawnLDtDsMmWM1NbBmgJ59";
const SETUP = [
  [117, 169, 176, 69, 197, 23, 15, 162],
  [251, 10, 231, 76, 27, 11, 159, 96],
  [136, 63, 15, 186, 211, 152, 168, 164],
];
const REFRESH_OBLIGATION = [33, 132, 147, 228, 151, 192, 72, 89];

const startsWith = (data: string, d: number[]) => {
  const head = [...Buffer.from(data, "base64").subarray(0, 8)];
  return d.every((b, i) => b === head[i]);
};

export function vaultObligation(vault: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Uint8Array.of(0), Uint8Array.of(0), vault.toBytes(), KAMINO_MARKET.toBytes(), PublicKey.default.toBytes(), PublicKey.default.toBytes()],
    KAMINO_LEND,
  )[0];
}

// Once the vault's obligation exists on the fork: drop one-time setup steps and list its USDC reserve on refresh, like mainnet would.
export function installKaminoApiShim(conn: Connection): void {
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await realFetch(input, init);
    if (!String(input).includes("/ktx/klend/deposit-instructions")) return res;
    const wallet = JSON.parse(String(init?.body ?? "{}")).wallet as string | undefined;
    if (!wallet || !(await conn.getAccountInfo(vaultObligation(new PublicKey(wallet)), "confirmed"))) return res;
    const body = (await res.json()) as { instructions: { data: string; accounts?: { address: string; role: string }[] }[] };
    body.instructions = body.instructions.filter((ix) => !SETUP.some((d) => startsWith(ix.data, d)));
    for (const ix of body.instructions) {
      if (startsWith(ix.data, REFRESH_OBLIGATION)) ix.accounts = [...(ix.accounts ?? []), { address: USDC_RESERVE, role: "READONLY" }];
    }
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
