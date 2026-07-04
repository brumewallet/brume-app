export function SeedPhraseGrid({ words }: { words: string[] }) {
  return (
    <div
      className="grid grid-cols-3 gap-2"
      onCopy={(e) => e.preventDefault()}
      onCut={(e) => e.preventDefault()}
      style={{ userSelect: "none", WebkitUserSelect: "none" }}
    >
      {words.map((w, i) => (
        <div
          key={`${i}-${w}`}
          className="flex items-center gap-2 rounded-xl bg-card px-2 py-2.5 text-xs ring-1 ring-border/60"
        >
          <span className="text-muted-foreground">{i + 1}</span>
          <span className="font-medium text-foreground">{w}</span>
        </div>
      ))}
    </div>
  );
}
