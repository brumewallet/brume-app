import { motion } from "motion/react";
import { formatTokenListAmount } from "@/lib/utils";
import { SOL_BASE_UNITS_PER_SOL } from "@/shared/constants";
import { cn } from "@/lib/utils";

const spring = { type: "spring", stiffness: 200, damping: 22, mass: 1 } as const;

export function BalanceCard(props: {
  balanceSolBaseUnits: string | null;
  simpleMode: boolean;
  totalUsdApprox: number | null;
  totalPortfolioSolApprox: number | null;
  balanceHidden?: boolean;
}) {
  const raw =
    props.balanceSolBaseUnits != null && props.balanceSolBaseUnits !== ""
      ? BigInt(props.balanceSolBaseUnits)
      : null;
  const nativeSol =
    raw != null ? Number(raw) / Number(SOL_BASE_UNITS_PER_SOL) : null;

  const solSubtitle =
    props.totalPortfolioSolApprox != null
      ? props.totalPortfolioSolApprox
      : nativeSol;

  const hidden = props.balanceHidden === true;

  return (
    <>
      <svg
        aria-hidden
        className="pointer-events-none absolute h-0 w-0 overflow-hidden"
        width={0}
        height={0}
      >
        <defs>
          <filter id="brume-pixelate-lg" x="0" y="0" width="100%" height="100%">
            <feFlood x="4" y="4" height="2" width="2" />
            <feComposite width="10" height="10" />
            <feTile result="a" />
            <feComposite in="SourceGraphic" in2="a" operator="in" />
            <feMorphology operator="dilate" radius="5" />
          </filter>
          <filter id="brume-pixelate-sm" x="0" y="0" width="100%" height="100%">
            <feFlood x="3" y="3" height="2" width="2" />
            <feComposite width="8" height="8" />
            <feTile result="a" />
            <feComposite in="SourceGraphic" in2="a" operator="in" />
            <feMorphology operator="dilate" radius="4" />
          </filter>
        </defs>
      </svg>

      {/* Glass balance card — loyal-app style */}
      <motion.div
        className="relative overflow-hidden rounded-3xl border border-border/50 bg-card/60 px-5 py-5 text-center backdrop-blur-xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={spring}
      >

        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/60"
           style={{ fontFamily: "var(--font-display)" }}>
          Total balance
        </p>

        <p
          className={cn(
            "text-[40px] font-semibold leading-tight tracking-tight",
            hidden ? "text-muted-foreground/40" : "text-foreground",
          )}
          style={{
            fontFamily: "var(--font-display)",
            ...(hidden
              ? { filter: "url(#brume-pixelate-lg)", userSelect: "none" }
              : undefined),
          }}
        >
          {props.totalUsdApprox != null
            ? `$${props.totalUsdApprox.toFixed(2)}`
            : "—"}
        </p>

        {solSubtitle != null && Number.isFinite(solSubtitle) && (
          <p
            className={cn(
              "mt-1.5 text-muted-foreground",
              props.simpleMode ? "text-sm" : "font-mono text-[12px]",
              hidden && "opacity-30",
            )}
            style={
              hidden
                ? { filter: "url(#brume-pixelate-sm)", userSelect: "none" }
                : undefined
            }
          >
            {`${formatTokenListAmount(solSubtitle)} SOL`}
          </p>
        )}
      </motion.div>
    </>
  );
}
