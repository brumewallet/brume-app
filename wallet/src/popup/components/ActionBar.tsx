import { motion } from "motion/react";
import { ClockOutlineIcon, NFTOutlineIcon, ReceiveIcon, SendButtonIcon } from "@/components/Icons";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

const tileSpring = { type: "spring", stiffness: 260, damping: 20 } as const;

function Tile(props: {
  to?: string;
  onClick?: () => void;
  icon: ReactNode;
  label: string;
  disabled?: boolean;
}) {
  const inner = (
    <motion.span
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-2 py-2",
        props.disabled ? "opacity-35" : "",
      )}
      whileTap={props.disabled ? {} : { scale: 0.93 }}
      transition={tileSpring}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-primary">
        {props.icon}
      </span>
      <span className="text-[12px] font-medium leading-none text-foreground/80">
        {props.label}
      </span>
    </motion.span>
  );

  if (props.disabled) return <span className="flex flex-1">{inner}</span>;
  if (props.to) return <Link to={props.to} className="flex flex-1">{inner}</Link>;
  return <button type="button" className="flex flex-1" onClick={props.onClick}>{inner}</button>;
}

export function ActionBar() {
  return (
    <motion.div
      className="grid grid-cols-4 gap-2 px-1 pt-1"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22, delay: 0.08 }}
    >
      <Tile to="/send" icon={<SendButtonIcon />} label="Send" />
      <Tile to="/receive" icon={<ReceiveIcon />} label="Receive" />
      <Tile to="/nfts" icon={<NFTOutlineIcon />} label="NFTs" />
      <Tile to="/activity" icon={<ClockOutlineIcon />} label="Activity" />
    </motion.div>
  );
}
