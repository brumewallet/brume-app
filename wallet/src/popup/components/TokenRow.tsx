import { motion } from "motion/react";
import { useId, useState } from "react";
import { Link } from "react-router-dom";
import { formatTokenListAmount } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "./VerifiedBadge";

function TokenAvatar(props: { symbol: string; logoUri?: string | null; className?: string }) {
  const { symbol, logoUri, className = "h-10 w-10" } = props;
  const [imgFailed, setImgFailed] = useState(false);
  const letter = symbol.charAt(0).toUpperCase();

  if (logoUri && !imgFailed) {
    return (
      <img
        src={logoUri}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover ring-2 ring-primary/35`}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className={`relative shrink-0 rounded-full bg-background ring-2 ring-primary/25 ${className}`}>
      <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-muted text-[11px] font-bold text-foreground">
        {letter}
      </div>
    </div>
  );
}

export type TokenRowNavState = {
  sendBackTo?: string;
  tokenDetailBackTo?: string;
};

export function TokenRow(props: {
  to?: string;
  navState?: TokenRowNavState;
  symbol: string;
  name: string;
  amountRaw: string | null;
  decimals?: number;
  simpleMode: boolean;
  logoUri?: string | null;
  verified?: boolean;
  fiatUsdApprox?: number | null;
  hideBalance?: boolean;
}) {
  const pixelFilterUid = useId().replace(/:/g, "");
  const pixelLgId = `brume-pixel-row-${pixelFilterUid}-lg`;
  const pixelSmId = `brume-pixel-row-${pixelFilterUid}-sm`;

  const decimals = props.decimals ?? 9;
  const raw = props.amountRaw != null && props.amountRaw !== "" ? BigInt(props.amountRaw) : 0n;
  const divisor = 10n ** BigInt(decimals);
  const display = Number(raw) / Number(divisor);
  const verified = props.verified ?? false;
  const hidden = props.hideBalance === true;

  const inner = (
    <>
      {hidden ? (
        <svg aria-hidden className="pointer-events-none absolute h-0 w-0 overflow-hidden" width={0} height={0}>
          <defs>
            <filter id={pixelLgId} x="0" y="0" width="100%" height="100%">
              <feFlood x="4" y="4" height="2" width="2" />
              <feComposite width="10" height="10" />
              <feTile result="a" />
              <feComposite in="SourceGraphic" in2="a" operator="in" />
              <feMorphology operator="dilate" radius="5" />
            </filter>
            <filter id={pixelSmId} x="0" y="0" width="100%" height="100%">
              <feFlood x="3" y="3" height="2" width="2" />
              <feComposite width="8" height="8" />
              <feTile result="a" />
              <feComposite in="SourceGraphic" in2="a" operator="in" />
              <feMorphology operator="dilate" radius="4" />
            </filter>
          </defs>
        </svg>
      ) : null}
      <TokenAvatar symbol={props.symbol} logoUri={props.logoUri} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[15px] font-semibold text-foreground">{props.name}</span>
          {verified ? <VerifiedBadge /> : null}
        </div>
        <p
          className={cn("text-[13px] text-muted-foreground", hidden && "opacity-30")}
          style={hidden ? { filter: `url(#${pixelSmId})`, userSelect: "none" } : undefined}
        >
          {formatTokenListAmount(display)} {props.symbol}
        </p>
      </div>
      <div className="shrink-0 text-right">
        {props.fiatUsdApprox != null ? (
          <p
            className={cn("text-[15px] font-medium text-foreground", hidden && "opacity-30")}
            style={hidden ? { filter: `url(#${pixelLgId})`, userSelect: "none" } : undefined}
          >
            ${props.fiatUsdApprox.toFixed(2)}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">—</p>
        )}
      </div>
    </>
  );

  const rowClass =
    "flex items-center gap-3 rounded-2xl border border-border/50 bg-card/60 px-3 py-3 backdrop-blur-sm transition-colors duration-150 hover:bg-card/80";

  const motionProps = {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { type: "spring" as const, stiffness: 220, damping: 24 },
    whileTap: props.to ? { scale: 0.98 } : {},
  };

  if (props.to) {
    return (
      <motion.div {...motionProps}>
        <Link to={props.to} state={props.navState} className={`${rowClass} relative block cursor-pointer no-underline outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
          {inner}
        </Link>
      </motion.div>
    );
  }

  return <motion.div {...motionProps} className={`${rowClass} relative`}>{inner}</motion.div>;
}
