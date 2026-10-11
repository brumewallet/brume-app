// Only Brume's own pages may send wallet-control messages; pages get DAPP_* only.
import { describe, expect, it } from "vitest";
import { isAllowedSender } from "@/background/origin-guard";

const EXT = "chrome-extension://abcdefghijklmnop/";

describe("isAllowedSender", () => {
  it("lets the popup, side panel, and approval window send anything", () => {
    expect(isAllowedSender("EXPORT_SECRET", `${EXT}index.html#/settings`, EXT)).toBe(true);
    expect(isAllowedSender("POPUP_APPROVE_SIGN", `${EXT}index.html?approval=1`, EXT)).toBe(true);
  });

  it("lets web pages send dApp requests", () => {
    expect(isAllowedSender("DAPP_CONNECT", "https://jup.ag/", EXT)).toBe(true);
  });

  it.each(["EXPORT_SECRET", "POPUP_APPROVE_SIGN", "UNLOCK", "SEND_SOL", "GET_STATE"])(
    "refuses %s from a web page",
    (type) => {
      expect(isAllowedSender(type, "https://evil.example/", EXT)).toBe(false);
      expect(isAllowedSender(type, `https://evil.example/${EXT}`, EXT)).toBe(false);
      expect(isAllowedSender(type, undefined, EXT)).toBe(false);
    },
  );

  it("refuses another extension's pages", () => {
    expect(isAllowedSender("EXPORT_SECRET", "chrome-extension://otherextension/x.html", EXT)).toBe(false);
  });
});
