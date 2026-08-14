import { cn } from "@/lib/utils";

export function ExtensionSendSpinner({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "size-12 rounded-full border-4 border-transparent brume-send-spin",
        "border-t-[color:var(--extension-accent)] border-r-[color:var(--extension-accent)]",
        className,
      )}
      aria-hidden
    />
  );
}

export function ExtensionMascot({
  variant,
  className,
}: {
  variant: "success" | "error";
  className?: string;
}) {
  const src =
    variant === "success" ? "/hero-new/success.svg" : "/hero-new/error.svg";
  return (
    <img
      src={src}
      alt={variant === "success" ? "Success" : "Error"}
      className={cn("h-20 w-[100px] object-contain brume-mascot-nod", className)}
    />
  );
}
