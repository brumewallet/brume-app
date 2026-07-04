import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { BrumeIcon } from "../components/BrumeIcon";
import { truncateMiddle } from "../lib/format";
import * as msg from "../messaging";
import { useWalletStore } from "../store";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@/components/Icons";

export function ManageAccounts() {
  const { state, refresh } = useWalletStore();
  const navigate = useNavigate();
  const [switchBusyId, setSwitchBusyId] = useState<string | null>(null);
  const [switchErr, setSwitchErr] = useState<string | null>(null);

  if (!state) return null;

  async function switchTo(accountId: string) {
    setSwitchErr(null);
    setSwitchBusyId(accountId);
    try {
      await msg.switchAccount(accountId);
      await refresh();
      navigate("/", { replace: true });
    } catch (e) {
      setSwitchErr(e instanceof Error ? e.message : "Switch failed");
    } finally {
      setSwitchBusyId(null);
    }
  }

  function goHome() {
    navigate("/", { replace: true });
  }

  return (
    <motion.div
      className="flex flex-col gap-4 px-4 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-2">
        <Link
          to="/"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "shrink-0 text-muted-foreground",
          )}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-[22px]" />
        </Link>
        <h1 className="flex-1 text-center text-lg font-semibold text-foreground pr-8" style={{ fontFamily: "var(--font-display)" }}>
          Manage accounts
        </h1>
      </div>

      <p className="text-xs text-muted-foreground">
        Each account has its own address. Tap an account to use it and return
        home — no extra password while your wallet is unlocked.
      </p>

      {switchErr ? (
        <p className="text-xs text-destructive" role="alert">
          {switchErr}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {state.accounts.map((a, idx) => {
          const active = a.id === state.activeAccountId;
          const busyHere = switchBusyId === a.id;
          const initial = (
            a.label.trim().charAt(0) || a.address.charAt(0) || "?"
          ).toUpperCase();
          function onActivate() {
            if (busyHere) return;
            if (active) {
              goHome();
              return;
            }
            void switchTo(a.id);
          }
          return (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 200, damping: 22, delay: idx * 0.04 }}
            >
              <div
                className={cn(
                  "flex items-center gap-2 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 py-2 pl-3 pr-2",
                  "cursor-pointer transition-colors hover:bg-muted/25 focus-within:ring-2 focus-within:ring-ring/50",
                  busyHere && "pointer-events-none opacity-70",
                )}
                role="button"
                tabIndex={0}
                aria-busy={busyHere || undefined}
                aria-label={
                  active
                    ? `${a.label}, active, go home`
                    : busyHere
                      ? `Switching to ${a.label}`
                      : `Use ${a.label} and go home`
                }
                onClick={onActivate}
                onKeyDown={(e) => {
                  if (busyHere) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onActivate();
                  }
                }}
              >
                <div className="flex min-w-0 flex-1 items-center gap-3 py-1">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-bold text-primary">
                    {initial}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-foreground">
                        {a.label}
                      </span>
                      {active ? (
                        <span className="shrink-0 text-[10px] font-semibold text-primary" style={{ fontFamily: "var(--font-display)" }}>
                          Active
                        </span>
                      ) : null}
                    </div>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {truncateMiddle(a.address, 5, 4)}
                    </p>
                  </div>
                </div>
                <Link
                  to={`/accounts/${encodeURIComponent(a.id)}/edit`}
                  className={cn(
                    buttonVariants({ variant: "secondary", size: "sm" }),
                    "h-8 shrink-0 rounded-xl px-3 text-xs no-underline",
                  )}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  Edit
                </Link>
              </div>
            </motion.li>
          );
        })}
      </ul>

      <Link
        to="/accounts/add"
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px]",
        )}
      >
        <BrumeIcon icon={Add01Icon} size={20} />
        Add account
      </Link>
    </motion.div>
  );
}
