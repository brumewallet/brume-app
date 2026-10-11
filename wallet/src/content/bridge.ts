import type { ExtensionMessage } from "@/shared/types";
import injectUrl from "./injected?script&module";

const TO_CONTENT = "brume_to_content";
const FROM_CONTENT = "brume_from_content";

function toExtensionMessage(data: {
  requestId: string;
  method: string;
  serializedTransaction?: string;
  serializedTransactions?: string[];
  message?: string;
  chain?: string;
  skipPreflight?: boolean;
}): ExtensionMessage | null {
  const rid = data.requestId;
  switch (data.method) {
    case "connect":
      return { type: "DAPP_CONNECT", requestId: rid };
    case "disconnect":
      return { type: "DAPP_DISCONNECT", requestId: rid };
    case "getAccounts":
      return { type: "DAPP_GET_ACCOUNTS", requestId: rid };
    case "signTransaction":
      return {
        type: "DAPP_SIGN_TRANSACTION",
        requestId: rid,
        payload: { serializedTransaction: data.serializedTransaction ?? "" },
      };
    case "signAndSendTransaction":
      return {
        type: "DAPP_SIGN_AND_SEND_TRANSACTION",
        requestId: rid,
        payload: {
          serializedTransaction: data.serializedTransaction ?? "",
          chain: typeof data.chain === "string" ? data.chain : undefined,
          skipPreflight: data.skipPreflight === true,
        },
      };
    case "signAllTransactions":
      return {
        type: "DAPP_SIGN_ALL_TRANSACTIONS",
        requestId: rid,
        payload: {
          serializedTransactions: data.serializedTransactions ?? [],
        },
      };
    case "signMessage":
      return {
        type: "DAPP_SIGN_MESSAGE",
        requestId: rid,
        payload: { message: data.message ?? "" },
      };
    default:
      return null;
  }
}

window.addEventListener("message", (ev: MessageEvent) => {
  if (ev.source !== window) return;
  const d = ev.data as {
    channel?: string;
    requestId?: string;
    method?: string;
    serializedTransaction?: string;
    serializedTransactions?: string[];
    message?: string;
    chain?: string;
    skipPreflight?: boolean;
  };
  if (d.channel !== TO_CONTENT || !d.requestId || !d.method) return;

  const msg = toExtensionMessage({
    requestId: d.requestId,
    method: d.method,
    serializedTransaction: d.serializedTransaction,
    serializedTransactions: d.serializedTransactions,
    message: d.message,
    chain: d.chain,
    skipPreflight: d.skipPreflight,
  });
  if (!msg) return;

  void chrome.runtime.sendMessage(msg);
});

chrome.runtime.onMessage.addListener(
  (msg: {
    type?: string;
    event?: string;
    requestId?: string;
    ok?: boolean;
    result?: unknown;
    error?: { code: number; message: string };
  }) => {
    if (msg?.type === "BRUME_EVENT" && msg.event === "accountsChanged") {
      window.postMessage({ channel: FROM_CONTENT, event: msg.event }, "*");
      return;
    }
    if (msg?.type !== "BRUME_RESOLVE" || !msg.requestId) return;
    window.postMessage(
      {
        channel: FROM_CONTENT,
        requestId: msg.requestId,
        ok: msg.ok,
        result: msg.result,
        error: msg.error,
      },
      "*",
    );
  },
);

const script = document.createElement("script");
script.src = chrome.runtime.getURL(injectUrl);
script.type = "module";
script.onload = () => script.remove();
(document.documentElement ?? document.head).appendChild(script);
