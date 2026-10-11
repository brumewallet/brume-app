// End-to-end check of the built extension (dist/) in Chromium: session survival,
// Wallet Standard connect/sign, approval window, unlock-first, account events.
// Run: pnpm build && pnpm test:e2e   (CHROME_PATH overrides the browser; needs
// `npx playwright install chromium` once if no Chromium is cached.)
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../dist");
// The pinned Playwright build, else the newest Chromium in the Playwright cache.
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const pinned = chromium.executablePath();
  if (fs.existsSync(pinned)) return pinned;
  const cache = pinned.slice(0, pinned.search(/[\\/]chromium-\d+/));
  const builds = fs.existsSync(cache)
    ? fs.readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse()
    : [];
  for (const b of builds) {
    const candidate = pinned.replace(/chromium-\d+/, b);
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error("No Chromium found. Run `npx playwright install chromium` or set CHROME_PATH.");
}
const CHROME = findChrome();
const MNEMONIC = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PASSWORD = "e2e-password-123";

const results = [];
// Approving closes the approval window, which Playwright reports as an error on the click.
const clickAndClose = (page, name) =>
  page.getByRole("button", { name, exact: true }).click({ timeout: 15000, noWaitAfter: true }).catch((e) => {
    if (!/closed/.test(e.message)) throw e;
  });
const check = (name, ok, detail = "") => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
};

const server = http.createServer((_, res) => {
  res.setHeader("content-type", "text/html");
  res.end("<!doctype html><title>dapp</title><h1>test dapp</h1>");
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const DAPP = `http://localhost:${server.address().port}/`;

const userDir = fs.mkdtempSync(path.join(os.tmpdir(), "brume-e2e-"));
const ctx = await chromium.launchPersistentContext(userDir, {
  executablePath: CHROME,
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});

try {
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  const extId = new URL(sw.url()).host;
  const extUrl = (p = "") => `chrome-extension://${extId}/index.html${p}`;

  const popup = await ctx.newPage();
  await popup.goto(extUrl());
  const send = (msg) =>
    popup.evaluate(
      (m) => new Promise((res) => chrome.runtime.sendMessage({ requestId: crypto.randomUUID(), ...m }, res)),
      msg,
    );

  // Manifest and onboarding.
  const manifest = await popup.evaluate(() => chrome.runtime.getManifest());
  check("release manifest has 6 hosts, no localhost/vercel", manifest.host_permissions.length === 6 &&
    !manifest.host_permissions.some((h) => /localhost|vercel|127\./.test(h)), manifest.host_permissions.join(" "));
  check("no scripting permission", !manifest.permissions.includes("scripting"));
  await popup.waitForSelector("text=The wallet that tells you", { timeout: 15000 });
  check("Welcome shows the new brand line", true);
  check("analytics opt-in box is unchecked", !(await popup.locator('input[type="checkbox"]').isChecked()));

  const created = await send({ type: "CREATE_WALLET", payload: { mnemonic: MNEMONIC, password: PASSWORD } });
  check("create wallet", created?.ok === true, created?.payload?.publicKey);
  const address = created?.payload?.publicKey;

  // Item 1: session survives a service-worker restart.
  const before = await sw.evaluate(() => performance.timeOrigin);
  const cdp = await ctx.newCDPSession(popup);
  await cdp.send("ServiceWorker.enable");
  await cdp.send("ServiceWorker.stopAllWorkers");
  await popup.waitForTimeout(1500);
  const stateAfter = await send({ type: "GET_STATE" });
  sw = ctx.serviceWorkers().find((w) => w.url().includes(extId)) ?? (await ctx.waitForEvent("serviceworker"));
  const after = await sw.evaluate(() => performance.timeOrigin).catch(() => null);
  check("worker really restarted", after !== null && after !== before, `${before} -> ${after}`);
  check("wallet still unlocked after worker restart", stateAfter?.payload?.locked === false);

  // Item 6: wallet-control messages from a web page are refused. (Pages cannot call
  // chrome.runtime directly; this checks that the extension page path still works.)
  const exportNoPw = await send({ type: "EXPORT_SECRET", payload: {} });
  check("export key without password is refused", exportNoPw?.ok === false, exportNoPw?.error?.message);
  const exportPw = await send({ type: "EXPORT_SECRET", payload: { password: PASSWORD } });
  check("export key with password works", exportPw?.ok === true);

  // Wallet Standard on a dApp page.
  const dapp = await ctx.newPage();
  await dapp.goto(DAPP);
  await dapp.waitForFunction(() => !!window.brume, null, { timeout: 10000 });
  const info = await dapp.evaluate(() => {
    const ws = [];
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register: (w) => ws.push(w) } }));
    window.__brumeWallet = ws.find((w) => w.name === "Brume");
    window.__changes = [];
    window.__brumeWallet?.features["standard:events"].on("change", (p) => window.__changes.push(p.accounts.map((a) => a.address)));
    return { names: ws.map((w) => w.name), features: Object.keys(window.__brumeWallet?.features ?? {}) };
  });
  check("Brume registers through Wallet Standard", info.names.includes("Brume"), info.features.join(" "));
  check("has signAndSendTransaction", info.features.includes("solana:signAndSendTransaction"));

  // Connect: the approval window opens by itself.
  const winPromise = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("approval=1"), timeout: 10000 });
  const connectP = dapp.evaluate(() =>
    window.__brumeWallet.features["standard:connect"].connect().then((r) => r.accounts.map((a) => a.address)),
  );
  const win = await winPromise.catch(() => null);
  check("connect opens the approval window", !!win);
  if (win) {
    await clickAndClose(win, "Connect");
  }
  const accounts = await connectP;
  check("connect returns the wallet address", accounts[0] === address, accounts[0]);

  // Sign message.
  const signWin = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("approval=1"), timeout: 10000 });
  const signP = dapp.evaluate(async () => {
    const w = window.__brumeWallet;
    const [out] = await w.features["solana:signMessage"].signMessage({
      account: w.accounts[0],
      message: new TextEncoder().encode("hello brume"),
    });
    return Array.from(out.signature);
  });
  const sw2 = await signWin.catch(() => null);
  if (sw2) {
    await clickAndClose(sw2, "Sign");
  }
  const sig = await signP;
  check("signMessage returns a 64-byte signature", sig.length === 64);

  // Item 2: sign while locked shows Unlock first, then the approval.
  await send({ type: "LOCK" });
  const lockedWin = ctx.waitForEvent("page", { predicate: (p) => p.url().includes("approval=1"), timeout: 10000 });
  const lockedSignP = dapp.evaluate(async () => {
    const w = window.__brumeWallet;
    const [out] = await w.features["solana:signMessage"].signMessage({
      account: w.accounts[0],
      message: new TextEncoder().encode("while locked"),
    });
    return out.signature.length;
  });
  const lw = await lockedWin.catch(() => null);
  check("locked sign opens the approval window", !!lw);
  if (lw) {
    await lw.waitForURL(/#\/unlock/, { timeout: 10000 }).catch(() => {});
    check("approval window shows Unlock first", lw.url().includes("#/unlock"), lw.url());
    await lw.fill('input[placeholder="Password"]', PASSWORD);
    await lw.locator('button[type="submit"]').click();
    await clickAndClose(lw, "Sign");
  }
  check("locked sign completes after unlock", (await lockedSignP) === 64);

  // Item 4: chain mismatch is refused before anything is signed.
  const mismatch = await dapp.evaluate(async () => {
    const w = window.__brumeWallet;
    try {
      await w.features["solana:signAndSendTransaction"].signAndSendTransaction({
        account: w.accounts[0],
        transaction: new Uint8Array([1, 2, 3]),
        chain: "solana:mainnet",
      });
      return "resolved";
    } catch (e) {
      return e.message;
    }
  });
  check("signAndSend on the wrong cluster is refused", /Brume is on solana:devnet/.test(mismatch), mismatch);

  // Item 5: switching to an account not connected to this site disconnects the page.
  const added = await send({ type: "ADD_HD_ACCOUNT", payload: {} });
  const state = await send({ type: "GET_STATE" });
  const other = state.payload.accounts.find((a) => a.address !== address) ?? state.payload.accounts.at(-1);
  await send({ type: "SWITCH_ACCOUNT", payload: { accountId: other.id } });
  await dapp.waitForTimeout(1500);
  const changes = await dapp.evaluate(() => window.__changes);
  check("account switch notifies the page (disconnect)", added?.ok && changes.some((c) => c.length === 0), JSON.stringify(changes));

  // Item 1b: the 30 s idle bug, the real way: close the popup and wait past Chrome's idle limit.
  const first = state.payload.accounts[0];
  await send({ type: "SWITCH_ACCOUNT", payload: { accountId: first.id } });
  for (const p of ctx.pages()) if (p.url().startsWith("chrome-extension://")) await p.close();
  await new Promise((r) => setTimeout(r, 40_000));
  const p2 = await ctx.newPage();
  await p2.goto(extUrl());
  const s2 = await p2.evaluate(
    () => new Promise((res) => chrome.runtime.sendMessage({ type: "GET_STATE", requestId: "x" }, res)),
  );
  check("still unlocked after 40 s with no popup open", s2?.payload?.locked === false);
} catch (e) {
  check("script error", false, e.stack?.split("\n").slice(0, 3).join(" | "));
} finally {
  await ctx.close();
  server.close();
  fs.rmSync(userDir, { recursive: true, force: true });
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}
