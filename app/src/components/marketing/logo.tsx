import { readFileSync } from "node:fs";
import { join } from "node:path";

function loadSvg(file: string): { viewBox: string; inner: string } {
  const raw = readFileSync(join(process.cwd(), "public", file), "utf8");
  const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 1000 1000";
  const inner = raw
    .replace(/[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>[\s\S]*$/, "")
    .replace(/fill="(?!none)[^"]*"/g, 'fill="currentColor"')
    .trim();
  return { viewBox, inner };
}

const MARK = loadSvg("Logo.svg");
const WORDMARK = loadSvg("Textmark-Logo.svg");

export function BrumeMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={MARK.viewBox}
      fill="currentColor"
      className={className}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: MARK.inner }}
    />
  );
}

export function BrumeWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={WORDMARK.viewBox}
      fill="currentColor"
      className={`h-7 w-auto text-ink ${className ?? ""}`}
      role="img"
      aria-label="Brume"
      dangerouslySetInnerHTML={{ __html: WORDMARK.inner }}
    />
  );
}
