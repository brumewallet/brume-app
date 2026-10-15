import { Check, X } from "lucide-react";
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
  const success = variant === "success";
  const Icon = success ? Check : X;
  return (
    <div
      role="img"
      aria-label={success ? "Success" : "Error"}
      className={cn(
        "flex size-16 items-center justify-center rounded-full",
        success
          ? "bg-[color:var(--extension-accent)]/15 text-[color:var(--extension-accent)]"
          : "bg-destructive/15 text-destructive",
        className,
      )}
    >
      <Icon className="size-8" strokeWidth={2.5} aria-hidden />
    </div>
  );
}
