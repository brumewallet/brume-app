import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NetworkBanner } from "./NetworkBanner";
import { truncateMiddle } from "../lib/format";
import { useWalletStore } from "../store";
import { CopyIcon } from "@/components/Icons";

function BrumeIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M200 332.046C200 265.747 253.726 212 320 212H484.36V320.316C477.732 387.043 427.038 440.813 361.773 452.141C355.696 453.196 351 458.31 351 464.481V473.992C351 480.163 355.696 485.276 361.773 486.331C423.486 497.044 472.171 545.703 482.892 607.382C483.948 613.461 489.06 618.157 495.228 618.157H504.77C510.937 618.157 516.049 613.461 517.105 607.382C527.826 545.703 576.513 497.044 638.227 486.331C644.304 485.276 649 480.163 649 473.992V464.481C649 458.31 644.304 453.196 638.227 452.141C572.961 440.813 522.265 387.043 515.637 320.316V212H680C746.274 212 800 265.747 800 332.046V547.908C800 588.045 779.948 625.528 746.564 647.792L566.564 767.838C526.257 794.721 473.743 794.721 433.436 767.838L253.437 647.792C220.053 625.528 200 588.046 200 547.908V332.046Z"
        fill="white"
      />
    </svg>
  );
}

export function MainShellHeader() {
  const navigate = useNavigate();
  const { state } = useWalletStore();
  const [copied, setCopied] = useState(false);
  const copiedTimeout = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeout.current != null) {
        window.clearTimeout(copiedTimeout.current);
        copiedTimeout.current = null;
      }
    };
  }, []);

  if (!state) return null;

  const pk = state.publicKey ?? "";
  const displayName = (state.accountLabel ?? "Main").trim() || "Main";

  async function copyAddr() {
    if (!pk) return;
    await navigator.clipboard.writeText(pk);
    setCopied(true);
    if (copiedTimeout.current != null) window.clearTimeout(copiedTimeout.current);
    copiedTimeout.current = window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div className="shrink-0">
      <header
        className="flex items-center justify-between gap-2 bg-background/90 px-4 pb-3 pt-[max(0.5rem,env(safe-area-inset-top,0px))] backdrop-blur-md"
        aria-label="Wallet"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate("/accounts")}
            aria-label="Manage accounts"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#130F30] outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <BrumeIcon size={22} />
          </button>

          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => navigate("/accounts")}
              className="block truncate text-left text-[15px] font-semibold text-foreground outline-none hover:opacity-80"
              style={{ fontFamily: "var(--font-display)" }}
            >
              {displayName}
            </button>
            {pk ? (
              <div className="-mt-0.5 flex items-center gap-1">
                <span className="truncate text-[12px] text-muted-foreground">
                  {truncateMiddle(pk, 4, 4)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="-ml-0.5 shrink-0 text-muted-foreground/50"
                  onClick={() => void copyAddr()}
                  aria-label="Copy address"
                >
                  {copied ? (
                    <Check className="h-[12px] w-[12px] text-[#34C759]" strokeWidth={2.5} />
                  ) : (
                    <CopyIcon className="size-[11px]" />
                  )}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      <NetworkBanner network={state.network} />
    </div>
  );
}
