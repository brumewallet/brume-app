import { NETWORKS, type NetworkId } from "@/shared/constants";

/** Full-width network strip under the account header (reference Home / Shield / token). */
export function NetworkBanner({ network }: { network: NetworkId }) {
  const label = NETWORKS[network].label;
  return (
    <div
      className="flex w-full shrink-0 items-center justify-center bg-primary px-3 py-2"
      role="status"
      aria-live="polite"
    >
      <p className="text-center text-[13px] font-semibold leading-4 text-primary-foreground">
        You are currently on {label}
      </p>
    </div>
  );
}
