import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import { ChevronLeft } from "lucide-react";
import { DISCLOSURE_ITEMS, type DisclosureItem } from "@brume/shared";
import { cn } from "@/lib/utils";

const STATE_BADGE: Record<
  DisclosureItem["state"],
  { bg: string; text: string; label: string }
> = {
  private: { bg: "bg-ube-100 dark:bg-ube-900/40", text: "text-ube-600 dark:text-ube-400", label: "Private" },
  public: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-600 dark:text-amber-400", label: "Public" },
  trust: { bg: "bg-secondary", text: "text-muted-foreground", label: "Trust" },
  roadmap: { bg: "bg-secondary", text: "text-muted-foreground", label: "Roadmap" },
};

function ItemCard({ item }: { item: DisclosureItem }) {
  const badge = STATE_BADGE[item.state];
  return (
    <div className="flex flex-col gap-1.5 rounded-2xl bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold leading-5 text-foreground">
          {item.label}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            badge.bg,
            badge.text,
          )}
        >
          {badge.label}
        </span>
      </div>
      <p className="text-[12px] leading-relaxed text-muted-foreground">{item.body}</p>
    </div>
  );
}

const SECTIONS: { state: DisclosureItem["state"]; heading: string }[] = [
  { state: "private", heading: "What is private" },
  { state: "public", heading: "What is public" },
  { state: "trust", heading: "Trust assumptions" },
  { state: "roadmap", heading: "Roadmap" },
];

export function Disclosure() {
  const navigate = useNavigate();

  return (
    <motion.div
      className="flex flex-col gap-5 pb-24"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 22 }}
    >
      <div className="flex items-center gap-1 px-3 pt-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border-none bg-transparent text-muted-foreground transition-colors hover:bg-secondary"
          aria-label="Back"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={2} />
        </button>
        <h1
          className="text-[18px] font-semibold leading-7 text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Privacy disclosure
        </h1>
      </div>

      <div className="flex flex-col gap-6 px-3">
        {SECTIONS.map(({ state, heading }) => {
          const items = DISCLOSURE_ITEMS.filter((i) => i.state === state);
          if (items.length === 0) return null;
          return (
            <div key={state} className="flex flex-col gap-2">
              <span className="px-1 text-[12px] font-medium uppercase leading-4 tracking-wide text-muted-foreground">
                {heading}
              </span>
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <ItemCard key={item.id} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
