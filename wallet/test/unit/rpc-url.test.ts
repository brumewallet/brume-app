// API routes fetch the wallet's custom RPC URL; only public HTTPS hosts may pass (no SSRF).
import { describe, expect, it } from "vitest";
import { isPublicHttpsUrl } from "../../../shared/src/rpc-url";

describe("isPublicHttpsUrl", () => {
  it.each([
    "https://api.mainnet-beta.solana.com",
    "https://mainnet.helius-rpc.com/?api-key=abc",
    "https://rpc.example.com:443/path",
  ])("allows %s", (u) => expect(isPublicHttpsUrl(u)).toBe(true));

  it.each([
    "http://api.mainnet-beta.solana.com",
    "https://localhost:8899",
    "https://127.0.0.1",
    "https://2130706433", // 127.0.0.1 as an integer
    "https://0x7f.0.0.1",
    "https://169.254.169.254/latest/meta-data",
    "https://10.0.0.5",
    "https://172.20.1.1",
    "https://192.168.1.10",
    "https://100.64.0.1",
    "https://[::1]",
    "https://[fd00::1]",
    "https://metadata.google.internal",
    "https://node.local",
    "https://intranet",
    "https://user:pass@rpc.example.com",
    "https://rpc.example.com:8080",
    "file:///etc/passwd",
    "not a url",
  ])("blocks %s", (u) => expect(isPublicHttpsUrl(u)).toBe(false));
});
