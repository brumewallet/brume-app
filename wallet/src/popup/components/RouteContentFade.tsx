import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Brume spring easing — matches loyal-app / web app motion system. */
const brumeSpring = [0.32, 0.72, 0, 1] as const;

export const routeContentTransition = {
  duration: 0.35,
  ease: brumeSpring,
} as const;

const routeContentTransitionFade = {
  duration: 0.28,
  ease: brumeSpring,
} as const;

export type RouteContentVariant =
  | "fade"
  | "home"
  | "send"
  | "secondaryNav"
  | "manageAccounts"
  | "accountSubpage";

type MotionState = Record<string, string | number>;

type EnterOnly = {
  initial: MotionState;
  animate: MotionState;
};

const motionByVariant: Record<RouteContentVariant, EnterOnly> = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
  },
  home: {
    initial: { opacity: 1, x: "100%" },
    animate: { opacity: 1, x: 0 },
  },
  send: {
    initial: { opacity: 1, y: "100dvh" },
    animate: { opacity: 1, y: 0 },
  },
  secondaryNav: {
    initial: { opacity: 1, x: "-100%" },
    animate: { opacity: 1, x: 0 },
  },
  manageAccounts: {
    initial: { opacity: 1, y: "100dvh" },
    animate: { opacity: 1, y: 0 },
  },
    // Manage / add / edit / private-key: full-opacity slide in from the right (same feel as `home`).

  accountSubpage: {
    initial: { opacity: 1, x: "100%" },
    animate: { opacity: 1, x: 0 },
  },
};

// Enter-only motion; `routeKey` remounts this layer so each navigation replays.

export function RouteContentFade(props: {
  routeKey: string;
  children: ReactNode;
  className?: string;
  variant?: RouteContentVariant;
}) {
  const variant = props.variant ?? "fade";
  const { initial, animate } = motionByVariant[variant];
  const transition =
    variant === "fade" ? routeContentTransitionFade : routeContentTransition;

  return (
    <motion.div
      key={props.routeKey}
      initial={initial}
      animate={animate}
      transition={transition}
      className={cn("w-full min-w-0", props.className)}
    >
      {props.children}
    </motion.div>
  );
}
