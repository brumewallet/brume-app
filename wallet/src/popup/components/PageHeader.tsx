import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowLeftIcon } from "@/components/Icons";

export function PageHeader(props: {
  title: string;
  backTo?: string;
  right?: ReactNode;
}) {
  return (
    <header className="flex items-center justify-between border-b border-border px-2 py-2">
      {props.backTo ? (
        <Link
          to={props.backTo}
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
            "size-9 shrink-0 rounded-full bg-secondary text-muted-foreground hover:bg-accent",
          )}
          aria-label="Back"
        >
          <ArrowLeftIcon className="size-[22px]" />
        </Link>
      ) : (
        <span className="w-9 shrink-0" />
      )}
      <h1 className="min-w-0 flex-1 truncate px-2 text-center text-[17px] font-semibold leading-7 text-foreground" style={{ fontFamily: "var(--font-display)" }}>
        {props.title}
      </h1>
      <div className="flex min-w-[36px] shrink-0 justify-end">{props.right}</div>
    </header>
  );
}
