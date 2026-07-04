import { Link, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const spring = { type: "spring", stiffness: 220, damping: 22 } as const;

function OptionRow({
  to,
  icon,
  title,
  description,
  delay,
}: {
  to: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay }}
      whileTap={{ scale: 0.98 }}
    >
      <Link
        to={to}
        className="flex items-center gap-4 rounded-2xl border border-border/60 bg-card px-4 py-4 no-underline transition-colors hover:bg-accent/40"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-foreground">{title}</p>
          <p className="text-[12px] text-muted-foreground">{description}</p>
        </div>
        <span className="ml-auto text-muted-foreground/40">›</span>
      </Link>
    </motion.div>
  );
}

export function ImportOptions() {
  const location = useLocation();
  const addAccountFlow = location.pathname.startsWith("/accounts/");
  const base = addAccountFlow ? "/accounts" : "";

  return (
    <motion.div
      className="flex min-h-[600px] flex-col gap-5 bg-background p-6"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <Link
        to={addAccountFlow ? "/accounts/add" : "/welcome"}
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "-ml-2 w-fit px-2 text-muted-foreground hover:text-foreground",
        )}
      >
        Back
      </Link>

      <div>
        <h1
          className="text-xl font-semibold text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {addAccountFlow ? "Add account" : "Import wallet"}
        </h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          Choose how you want to import.
        </p>
      </div>

      <div className="flex flex-col gap-2.5">
        <OptionRow
          to={`${base}/import`}
          delay={0.06}
          title="Recovery phrase"
          description="12 or 24-word seed phrase"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M7 8h10M7 12h6M7 16h8" />
            </svg>
          }
        />
        <OptionRow
          to={`${base}/import-private-key`}
          delay={0.1}
          title="Private key"
          description="Import a single account"
          icon={
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="5.5" />
              <path d="M10.85 12.15L19 4M18 5l2 2M15 8l2 2" />
            </svg>
          }
        />
      </div>
    </motion.div>
  );
}
