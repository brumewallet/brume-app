import { Link } from "react-router-dom";
import { motion } from "motion/react";
import {
  AccountRecoveryIcon,
  ArrowDown01Icon,
  DocumentCodeIcon,
} from "@hugeicons/core-free-icons";
import { buttonVariants } from "@/components/ui/button";
import { BrumeIcon } from "../components/BrumeIcon";
import { useWalletStore } from "../store";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@/components/Icons";

function OptionRow(props: {
  icon: typeof AccountRecoveryIcon;
  title: string;
  subtitle: string;
  to?: string;
  disabled?: boolean;
}) {
  const inner = (
    <motion.div
      className={cn(
        "flex w-full items-center gap-3 rounded-2xl bg-card/60 backdrop-blur-xl border border-border/50 px-4 py-3.5 text-left transition-colors",
        props.disabled
          ? "cursor-not-allowed opacity-50"
          : "hover:bg-muted/30",
      )}
      whileTap={props.disabled ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 260, damping: 20 }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground">
        <BrumeIcon icon={props.icon} size={22} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-foreground">{props.title}</p>
        <p className="text-xs text-muted-foreground">{props.subtitle}</p>
      </div>
    </motion.div>
  );

  if (props.disabled || !props.to) {
    return (
      <div className="block w-full" aria-disabled={props.disabled}>
        {inner}
      </div>
    );
  }

  return (
    <Link to={props.to} className="block w-full no-underline">
      {inner}
    </Link>
  );
}

export function AddAccount() {
  const { state } = useWalletStore();
  const hdOk = state?.hdDerivationAvailable ?? false;

  return (
    <motion.div
      className="flex flex-col gap-4 px-4 pb-24 pt-4"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-2">
        <Link
          to="/accounts"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon-xs" }),
            "shrink-0 text-muted-foreground",
          )}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-[22px]" />
        </Link>
        <h1 className="flex-1 pr-8 text-center text-lg font-semibold text-foreground" style={{ fontFamily: "var(--font-display)" }}>
          Add account
        </h1>
      </div>

      <div className="flex flex-col gap-2">
        <OptionRow
          icon={AccountRecoveryIcon}
          title="Add account (same recovery phrase)"
          subtitle={
            hdOk
              ? "Next address: m/44'/501'/…'/0' — HD wallet like Phantom / Solflare"
              : "Not available for this wallet (no stored phrase for derivation)"
          }
          to={hdOk ? "/accounts/add-hd" : undefined}
          disabled={!hdOk}
        />

        <Link
          to="/accounts/create"
          className={cn(
            buttonVariants({ variant: "default" }),
            "flex h-12 items-center justify-center rounded-2xl text-[15px] no-underline",
          )}
        >
          Create new wallet
        </Link>
        <p className="px-1 text-center text-xs text-muted-foreground">
          Generates a new recovery phrase; does not share keys with your other
          accounts.
        </p>

        <OptionRow
          icon={DocumentCodeIcon}
          title="Import recovery phrase"
          subtitle="Bring in an address from another wallet"
          to="/accounts/import"
        />
        <OptionRow
          icon={ArrowDown01Icon}
          title="Import private key"
          subtitle="Base64, hex, or JSON byte array"
          to="/accounts/import-private-key"
        />
      </div>

      <Link
        to="/accounts"
        className={cn(
          buttonVariants({ variant: "secondary" }),
          "mt-4 flex h-12 items-center justify-center rounded-2xl text-[15px]",
        )}
      >
        Close
      </Link>
    </motion.div>
  );
}
