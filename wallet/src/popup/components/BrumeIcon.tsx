import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

const STROKE = 1.75;

export function BrumeIcon({
  icon,
  className,
  size = 24,
}: {
  icon: IconSvgElement;
  className?: string;
  size?: number;
}) {
  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      strokeWidth={STROKE}
      color="currentColor"
      className={className}
      aria-hidden
    />
  );
}
