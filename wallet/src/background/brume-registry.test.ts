import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { fetchRecipientXWingKey, registerXWingKey } from "./brume-registry";
import { XWING_PUBLIC_KEY_SIZE } from "./note-crypto-types";
import { getConnection, requestAirdropDevnet } from "./rpc";

// Real network round trip: needs a live connection and a funded signer, so
// it's opt-in, not part of the default offline `pnpm test` run.
// Run with: BRUME_TEST_DEVNET=1 pnpm exec vitest run brume-registry
describe.skipIf(!process.env.BRUME_TEST_DEVNET)("brume-registry (devnet)", () => {
  it(
    "round-trips a real key through registerXWingKey/fetchRecipientXWingKey",
    async () => {
      const conn = getConnection("devnet");
      const owner = Keypair.generate();
      await requestAirdropDevnet("devnet", owner.publicKey.toBase58(), 1);

      const before = await fetchRecipientXWingKey(conn, owner.publicKey.toBase58());
      expect(before).toBeNull();

      const key = crypto.getRandomValues(new Uint8Array(XWING_PUBLIC_KEY_SIZE));
      const { signature } = await registerXWingKey({
        network: "devnet",
        from: owner,
        xwingPublicKey: key,
      });
      expect(signature).toBeTruthy();

      const after = await fetchRecipientXWingKey(conn, owner.publicKey.toBase58());
      expect(after).toEqual(key);
    },
    60_000,
  );
});
