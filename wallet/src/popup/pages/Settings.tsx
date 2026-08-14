import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Globe,
  Lock,
  Monitor,
  Moon,
  Server,
  Sun,
  Timer,
  Users,
} from "lucide-react";
import type { ExtensionMessage } from "@/shared/types";
import { cn } from "@/lib/utils";
import { applyUiSurfaceClass, readUiSurface, type UiSurface } from "../lib/ui-shell";
import { ensureRpcHostPermission } from "../lib/rpc-permissions";
import * as msg from "../messaging";
import { useWalletStore } from "../store";
import { PasswordInput } from "../components/PasswordInput";
import { CopyIcon, EyeIcon, EyeSlashIcon } from "@/components/Icons";

const font = "font-sans";
const secondary = "text-muted-foreground";
const chevronMuted = "text-muted-foreground/60";

function sendBg<T>(message: ExtensionMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (res: unknown) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      const r = res as
        | { ok: true; payload?: unknown }
        | { ok: false; error: { code: number; message: string } }
        | null
        | undefined;
      if (!r) {
        reject(new Error("No response"));
        return;
      }
      if (!r.ok) {
        reject(new Error(r.error?.message ?? "Unknown error"));
        return;
      }
      resolve(r.payload as T);
    });
  });
}

function SettingsRow({
  icon,
  title,
  detail,
  onClick,
  destructive,
  children,
}: {
  icon?: React.ReactNode;
  title: string;
  detail?: string;
  onClick?: () => void;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const clickable = !!onClick;
  return (
    <div
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => onClick?.()}
      onKeyDown={(e) => {
        if (!clickable) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "flex w-full items-center px-4 text-left transition-colors duration-100",
        clickable ? "cursor-pointer hover:bg-secondary" : "cursor-default",
      )}
    >
      {icon ? (
        <div
          className={cn(
            "flex shrink-0 items-center pr-2.5",
            destructive ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {icon}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 items-center justify-between border-b border-border py-2.5">
        <span
          className={cn(
            font,
            "text-[14px] font-normal leading-5",
            destructive ? "text-destructive" : "text-foreground",
          )}
        >
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-1 pl-3">
          {detail ? (
            <span className={cn(font, "text-[14px] font-normal leading-5", secondary)}>
              {detail}
            </span>
          ) : null}
          {children}
          {clickable && !children ? (
            <ChevronRight className={cn("h-3.5 w-3.5", chevronMuted)} strokeWidth={2} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {label ? (
        <span
          className={cn(
            font,
            "pl-4 text-[12px] font-medium uppercase leading-4 tracking-wide",
            secondary,
          )}
        >
          {label}
        </span>
      ) : null}
      <div
        className={cn(
          "overflow-hidden rounded-2xl",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="mx-3 mb-2 mt-1 flex gap-1 rounded-xl bg-secondary p-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            font,
            "min-w-0 flex-1 rounded-lg border-none py-2 text-[13px] font-medium leading-5 transition-all duration-150",
            value === opt.value
              ? "bg-card text-card-foreground shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
              : cn("bg-transparent", secondary),
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function Settings() {
  const navigate = useNavigate();
  const { state, refresh } = useWalletStore();
  const [sites, setSites] = useState<
    Array<{ origin: string; publicKey: string; connectedAt: number }>
  >([]);
  const [exported, setExported] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [rpcInput, setRpcInput] = useState("");
  const [rpcSaveErr, setRpcSaveErr] = useState<string | null>(null);
  const [savingRpc, setSavingRpc] = useState(false);
const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [revealKey, setRevealKey] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [showRpc, setShowRpc] = useState(false);
  const [uiSurface, setUiSurfaceState] = useState<UiSurface>("sidepanel");
  const [switchMessage, setSwitchMessage] = useState<string | null>(null);
  const [lockTimeout, setLockTimeout] = useState(15);
  const [theme, setTheme] = useState<"system" | "light" | "dark">(
    () => (localStorage.getItem("brume:theme") as "system" | "light" | "dark") ?? "system",
  );

  const [pkPassword, setPkPassword] = useState("");
  const [pkBusy, setPkBusy] = useState(false);
  const [pkVerified, setPkVerified] = useState(false);

  useEffect(() => {
    void msg.listConnectedSites().then((r) => setSites(r.sites));
  }, [state?.publicKey, state?.activeAccountId]);

  useEffect(() => {
    setRpcInput(state?.rpcUrlOverride ?? "");
  }, [state?.rpcUrlOverride]);

  useEffect(() => {
    void readUiSurface().then(setUiSurfaceState);
  }, []);

  useEffect(() => {
    const requestId = crypto.randomUUID();
    void sendBg<{ minutes: number }>({ type: "GET_AUTO_LOCK_TIMEOUT", requestId }).then(
      (r) => setLockTimeout(r.minutes),
    );
  }, []);

  const handleCopyExported = useCallback(() => {
    if (!exported) return;
    void navigator.clipboard.writeText(exported);
    setCopiedKey(true);
    window.setTimeout(() => setCopiedKey(false), 2000);
  }, [exported]);

  const handleRevealKey = useCallback(() => {
    setRevealKey((v) => !v);
  }, []);

  const handleVerifyPrivateKeyPassword = useCallback(async () => {
    const pw = pkPassword;
    if (!pw) return;
    setErr(null);
    setPkBusy(true);
    try {
      const r = await msg.exportSecret(pw);
      setExported(r.secretKeyBase64);
      setPkVerified(true);
      setRevealKey(true);
      setPkPassword("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Incorrect password");
    } finally {
      setPkBusy(false);
    }
  }, [pkPassword]);

  if (!state) return null;

  async function saveRpc() {
    setRpcSaveErr(null);
    const trimmed = rpcInput.trim();
    if (!trimmed) {
      setRpcSaveErr("Paste a full HTTPS RPC URL, or reset to use the default.");
      return;
    }
    try {
      const u = new URL(trimmed);
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        setRpcSaveErr("URL must start with https:// or http://");
        return;
      }
    } catch {
      setRpcSaveErr("Invalid URL.");
      return;
    }
    setSavingRpc(true);
    try {
      const ok = await ensureRpcHostPermission(trimmed);
      if (!ok) {
        setRpcSaveErr("Permission denied - allow host access when Chrome prompts.");
        return;
      }
      await msg.setRpcUrlOverride(trimmed);
      await refresh();
    } catch (e) {
      setRpcSaveErr(e instanceof Error ? e.message : "Failed to save RPC");
    } finally {
      setSavingRpc(false);
    }
  }

  async function clearRpc() {
    setRpcSaveErr(null);
    setSavingRpc(true);
    try {
      await msg.setRpcUrlOverride(null);
      setRpcInput("");
      await refresh();
    } catch (e) {
      setRpcSaveErr(e instanceof Error ? e.message : "Failed to reset");
    } finally {
      setSavingRpc(false);
    }
  }

  const pk = state.publicKey ?? "";
  const truncatedKey = pk ? `${pk.slice(0, 4)}…${pk.slice(-4)}` : null;

  async function onSurfaceChange(mode: UiSurface) {
    if (mode === uiSurface) return;
    try {
      const prev = uiSurface;
      await msg.setUiSurface(mode);
      applyUiSurfaceClass(mode);
      setUiSurfaceState(mode);
      if (mode === "popup") {
        window.setTimeout(() => window.close(), 200);
      } else {
        if (prev === "popup") {
          window.setTimeout(() => window.close(), 200);
        } else {
          setSwitchMessage(
            "Open Brume from the toolbar and choose the side panel.",
          );
        }
      }
    } catch {
      // ignore
    }
  }

  return (
    <motion.div
      className="relative flex flex-col gap-5 px-3 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <h1 className={cn(font, "px-1 text-[18px] font-semibold leading-7 text-foreground")} style={{ fontFamily: "var(--font-display)" }}>
        Settings
      </h1>

        <Section label="Wallet">
          {truncatedKey ? (
            <SettingsRow
              icon={<Globe className="h-[18px] w-[18px]" strokeWidth={2} />}
              title="Address"
              detail={truncatedKey}
            >
              <button
                type="button"
                className={cn(
                  font,
                  "flex items-center gap-1.5 rounded-xl border border-border bg-card px-2.5 py-1 text-[12px] font-medium leading-4 text-foreground",
                  "transition-colors hover:bg-secondary active:scale-[0.98]",
                )}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void navigator.clipboard.writeText(pk);
                  setCopiedAddress(true);
                  window.setTimeout(() => setCopiedAddress(false), 1500);
                }}
              >
                {copiedAddress ? (
                  <>
                    <Check
                      className="h-3.5 w-3.5 text-[color:var(--extension-success)]"
                      strokeWidth={2}
                    />
                  </>
                ) : (
                  <>
                    <CopyIcon className="size-3.5" />
                  </>
                )}
                Copy
              </button>
            </SettingsRow>
          ) : null}
          <SettingsRow
            icon={<EyeIcon className="size-[18px]" />}
            title="Private key"
            onClick={() => {
              setShowPrivateKey(!showPrivateKey);
              setRevealKey(false);
              setExported(null);
              setErr(null);
              setPkPassword("");
              setPkBusy(false);
              setPkVerified(false);
            }}
          >
            {showPrivateKey ? (
              <ChevronUp className={cn("h-3.5 w-3.5", chevronMuted)} strokeWidth={2} />
            ) : (
              <ChevronDown className={cn("h-3.5 w-3.5", chevronMuted)} strokeWidth={2} />
            )}
          </SettingsRow>
          {showPrivateKey ? (
            <div className="mx-3 mb-2 flex flex-col gap-2 rounded-xl bg-accent p-3">
              <span
                className={cn(
                  font,
                  "text-center text-[12px] leading-4 text-destructive",
                )}
              >
                Never share your private key. Anyone with it has full access to your wallet.
              </span>
              {!pkVerified ? (
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void handleVerifyPrivateKeyPassword();
                  }}
                >
                  <PasswordInput
                    value={pkPassword}
                    onChange={setPkPassword}
                    placeholder="Enter your password"
                    className="bg-card"
                  />
                  <button
                    type="submit"
                    disabled={pkBusy || !pkPassword}
                    className={cn(
                      font,
                      "h-10 w-full rounded-2xl bg-primary text-[13px] font-medium text-primary-foreground transition-opacity disabled:opacity-40",
                    )}
                  >
                    {pkBusy ? "Checking…" : "Continue"}
                  </button>
                </form>
              ) : (
                <>
                  <div className="relative max-h-20 overflow-y-auto rounded-lg bg-secondary py-2.5 pl-3 pr-10 font-mono text-[11px] leading-4 text-foreground break-all">
                    {revealKey && exported
                      ? exported
                      : "••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••"}
                    <button
                      type="button"
                      onClick={() => void handleRevealKey()}
                      className="absolute right-2 top-1/2 flex -translate-y-1/2 border-none bg-transparent p-0.5 text-muted-foreground"
                      aria-label={revealKey ? "Hide" : "Reveal"}
                    >
                      {revealKey ? (
                        <EyeSlashIcon className="size-3.5" />
                      ) : (
                        <EyeIcon className="size-3.5" />
                      )}
                    </button>
                  </div>
                </>
              )}
              {err ? (
                <p className={cn(font, "text-center text-[12px] text-destructive")} role="alert">
                  {err}
                </p>
              ) : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!exported || !pkVerified}
                  onClick={() => handleCopyExported()}
                  className={cn(
                    font,
                    "flex flex-1 items-center justify-center gap-1.5 rounded-lg border-none bg-primary py-2 text-[13px] font-medium leading-4 text-primary-foreground transition-colors duration-150 disabled:opacity-40",
                  )}
                >
                  {copiedKey ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={2} />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                  {copiedKey ? "Copied!" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPrivateKey(false);
                    setRevealKey(false);
                    setExported(null);
                    setErr(null);
                    setPkPassword("");
                    setPkBusy(false);
                    setPkVerified(false);
                  }}
                  className={cn(
                    font,
                    "flex flex-1 items-center justify-center rounded-lg border-none bg-secondary py-2 text-[13px] font-medium leading-4 text-secondary-foreground transition-colors duration-150",
                  )}
                >
                  Hide
                </button>
              </div>
            </div>
          ) : null}
          <SettingsRow
            icon={<Users className="h-[18px] w-[18px]" strokeWidth={2} />}
            title="Manage accounts"
            onClick={() => navigate("/accounts")}
          />
        </Section>

        <Section label="RPC">
          <SettingsRow
            icon={<Server className="h-[18px] w-[18px]" strokeWidth={2} />}
            title="RPC endpoint"
            onClick={() => setShowRpc(!showRpc)}
          >
            {showRpc ? (
              <ChevronUp className={cn("h-3.5 w-3.5", chevronMuted)} strokeWidth={2} />
            ) : (
              <ChevronDown className={cn("h-3.5 w-3.5", chevronMuted)} strokeWidth={2} />
            )}
          </SettingsRow>
          <div
            className={cn(
              "overflow-hidden transition-[max-height,opacity] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              showRpc ? "max-h-[320px] opacity-100" : "max-h-0 opacity-0",
            )}
          >
            <div className="mx-3 mb-2 flex flex-col gap-2 rounded-xl bg-secondary p-3">
                <p className={cn(font, "text-[11px] leading-relaxed text-muted-foreground")}>
                  Optional HTTPS RPC for balances and sends. Portfolio and activity use the Brume API.
                </p>
                <input
                  className={cn(
                    font,
                    "h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground outline-none",
                  )}
                  placeholder="https://…"
                  value={rpcInput}
                  onChange={(e) => setRpcInput(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  name="rpcUrl"
                />
                {rpcSaveErr ? (
                  <p className="text-[11px] text-destructive" role="alert">
                    {rpcSaveErr}
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingRpc}
                    onClick={() => void saveRpc()}
                    className={cn(
                      font,
                      "flex-1 rounded-lg border-none bg-primary py-2 text-xs font-medium text-primary-foreground disabled:opacity-50",
                    )}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={savingRpc}
                    onClick={() => void clearRpc()}
                    className={cn(
                      font,
                      "flex-1 rounded-lg border-none bg-secondary py-2 text-xs font-medium text-secondary-foreground disabled:opacity-50",
                    )}
                  >
                    Reset
                  </button>
                </div>
            </div>
          </div>
        </Section>

        <Section label="Connected sites">
          {sites.length === 0 ? (
            <p className={cn(font, "px-4 py-3 text-[13px] leading-5", secondary)}>
              None yet.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {sites.map((s) => (
                <li
                  key={s.origin}
                  className="flex items-center justify-between gap-2 px-4 py-2.5"
                >
                  <span className={cn(font, "min-w-0 truncate text-[13px] text-foreground")}>
                    {s.origin}
                  </span>
                  <button
                    type="button"
                    className={cn(
                      font,
                      "shrink-0 border-none bg-transparent text-[13px] font-medium text-destructive transition-opacity hover:opacity-80",
                    )}
                    onClick={() =>
                      void msg.disconnectSite(s.origin).then(() =>
                        msg.listConnectedSites().then((r) => setSites(r.sites)),
                      )
                    }
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section label="Extension">
          <SegmentedControl
            options={[
              { value: "sidepanel" as const, label: "Side panel" },
              { value: "popup" as const, label: "Popup" },
            ]}
            value={uiSurface}
            onChange={(v) => void onSurfaceChange(v)}
          />
          <div className="px-4">
            <div className="flex items-center justify-between py-2.5">
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
                ) : theme === "light" ? (
                  <Sun className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
                ) : (
                  <Monitor className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
                )}
                <span className={cn(font, "text-[14px] font-normal leading-5 text-foreground")}>
                  Appearance
                </span>
              </div>
            </div>
          </div>
          <SegmentedControl
            options={[
              { value: "system" as const, label: "System" },
              { value: "light" as const, label: "Light" },
              { value: "dark" as const, label: "Dark" },
            ]}
            value={theme}
            onChange={(v) => {
              setTheme(v);
              localStorage.setItem("brume:theme", v);
              const mq = window.matchMedia("(prefers-color-scheme: dark)");
              const dark = v === "dark" || (v === "system" && mq.matches);
              document.documentElement.classList.toggle("dark", dark);
            }}
          />
          <SettingsRow
            icon={<Lock className="h-[18px] w-[18px]" strokeWidth={2} />}
            title="Lock now"
            onClick={() => void msg.lockWallet().then(() => refresh())}
            destructive
          />
          <div className="px-4">
            <div className="flex items-center py-2.5">
              <div className="flex items-center gap-3">
                <Timer className="h-[18px] w-[18px] text-muted-foreground" strokeWidth={2} />
                <span className={cn(font, "text-[14px] font-normal leading-5 text-foreground")}>
                  Auto-lock
                </span>
              </div>
            </div>
          </div>
          <SegmentedControl
            options={[
              { value: 5, label: "5m" },
              { value: 15, label: "15m" },
              { value: 30, label: "30m" },
              { value: 60, label: "1h" },
              { value: 0, label: "Never" },
            ]}
            value={lockTimeout}
            onChange={(v) => {
              setLockTimeout(v);
              const requestId = crypto.randomUUID();
              void sendBg<{ minutes: number }>({
                type: "SET_AUTO_LOCK_TIMEOUT",
                requestId,
                payload: { minutes: v },
              });
            }}
          />
        </Section>

      {switchMessage ? (
        <button
          type="button"
          className={cn(
            "absolute inset-0 z-[50] flex cursor-default items-center justify-center border-none bg-background/80 px-6 backdrop-blur-md",
          )}
          onClick={() => setSwitchMessage(null)}
          aria-label="Dismiss"
        >
          <span
            className={cn(
              font,
              "pointer-events-none max-w-[280px] text-center text-[15px] font-semibold leading-[22px] text-foreground",
            )}
          >
            {switchMessage}
          </span>
        </button>
      ) : null}
    </motion.div>
  );
}
