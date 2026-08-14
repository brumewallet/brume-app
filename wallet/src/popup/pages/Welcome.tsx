import { motion } from "motion/react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const spring = { type: "spring", stiffness: 160, damping: 18, mass: 1 } as const;
const ease = [0.32, 0.72, 0, 1] as const;

function BrumeLogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1000 1000"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M200 332.046C200 265.747 253.726 212 320 212H484.36V320.316C477.732 387.043 427.038 440.813 361.773 452.141C355.696 453.196 351 458.31 351 464.481V473.992C351 480.163 355.696 485.276 361.773 486.331C423.486 497.044 472.171 545.703 482.892 607.382C483.948 613.461 489.06 618.157 495.228 618.157H504.77C510.937 618.157 516.049 613.461 517.105 607.382C527.826 545.703 576.513 497.044 638.227 486.331C644.304 485.276 649 480.163 649 473.992V464.481C649 458.31 644.304 453.196 638.227 452.141C572.961 440.813 522.265 387.043 515.637 320.316V212H680C746.274 212 800 265.747 800 332.046V547.908C800 588.045 779.948 625.528 746.564 647.792L566.564 767.838C526.257 794.721 473.743 794.721 433.436 767.838L253.437 647.792C220.053 625.528 200 588.046 200 547.908V332.046Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function Welcome() {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {}
      <div className="relative flex flex-1 flex-col items-center justify-center px-8 pb-6 pt-12">
        <motion.div
          className="mb-6 flex items-center justify-center text-primary"
          initial={{ opacity: 0, scale: 0.80 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={spring}
        >
          <BrumeLogoMark size={88} />
        </motion.div>

        <motion.p
          className="mb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground/60"
          style={{ fontFamily: "var(--font-display)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ ease, duration: 0.45, delay: 0.1 }}
        >
          Brume Wallet
        </motion.p>

        <motion.h1
          className="text-center text-[25px] font-semibold leading-[1.22] tracking-[-0.025em] text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease, duration: 0.55, delay: 0.14 }}
        >
          Public is the feature
          <br />
          <span className="text-primary">you opt into.</span>
        </motion.h1>

        <motion.p
          className="mt-3.5 text-center text-[13px] leading-[1.65] text-muted-foreground"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ease, duration: 0.5, delay: 0.22 }}
        >
          Privacy and control, built into the core,
          <br />
          not bolted on.
        </motion.p>
      </div>

      {}
      <motion.div
        className="relative px-5 pb-7 pt-3"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ease, duration: 0.5, delay: 0.32 }}
      >
        <div className="flex flex-col gap-2.5">
          <motion.div whileTap={{ scale: 0.975 }} transition={{ duration: 0.13, ease }}>
            <Link
              to="/create"
              className={cn(
                buttonVariants({ size: "lg" }),
                "h-[52px] w-full justify-center rounded-2xl text-[15px] font-semibold",
              )}
            >
              Create a new wallet
            </Link>
          </motion.div>

          <motion.div whileTap={{ scale: 0.975 }} transition={{ duration: 0.13, ease }}>
            <Link
              to="/import-options"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-[52px] w-full justify-center rounded-2xl text-[15px] font-medium",
              )}
            >
              I already have a wallet
            </Link>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
