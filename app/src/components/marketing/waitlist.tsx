"use client";

import { useId, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";

type Status = "idle" | "submitting" | "done" | "error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Waitlist() {
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [agreed, setAgreed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const agreeId = `${fieldId}-agree`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const email = inputRef.current?.value.trim() ?? "";
    if (!EMAIL_RE.test(email)) {
      setStatus("error");
      setMessage("That doesn't look like an email. Mind checking it?");
      inputRef.current?.focus();
      return;
    }
    if (!agreed) {
      setStatus("error");
      setMessage("Please agree to the Terms and Privacy Policy to continue.");
      return;
    }
    setStatus("submitting");
    setMessage("");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, acceptedTerms: true }),
      });
      if (!res.ok) throw new Error("bad status");
      setStatus("done");
      setMessage("You're on the list. We'll email you the moment Brume ships.");
    } catch {
      setStatus("error");
      setMessage("Something broke on our end. Try again in a moment.");
    }
  }

  if (status === "done") {
    return (
      <div
        className="mx-auto flex max-w-md items-center justify-center gap-3 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-white"
        role="status"
      >
        <span className="h-2 w-2 shrink-0 rounded-full bg-ube-400" />
        <p className="text-sm">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="mx-auto max-w-md">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor={fieldId} className="sr-only">
          Email address for the Brume waitlist
        </label>
        <input
          ref={inputRef}
          id={fieldId}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@email.com"
          aria-invalid={status === "error"}
          aria-describedby={status === "error" ? errorId : undefined}
          onInput={() => status === "error" && setStatus("idle")}
          className="h-12 w-full rounded-full border border-white/15 bg-white/[0.06] px-5 text-sm text-white placeholder:text-ube-200/70 focus:border-white/30"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="press inline-flex h-12 shrink-0 items-center justify-center rounded-full bg-ube-400 px-6 text-sm font-semibold text-navy-900 shadow-accent transition hover:-translate-y-0.5 hover:bg-ube-300 disabled:opacity-70 disabled:hover:translate-y-0"
        >
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
        </button>
      </div>

      <div className="mt-3 flex items-start gap-2.5">
        <Checkbox
          id={agreeId}
          checked={agreed}
          aria-invalid={status === "error" && !agreed}
          onCheckedChange={(checked) => {
            setAgreed(checked === true);
            if (status === "error") setStatus("idle");
          }}
          className="mt-0.5"
        />
        <label htmlFor={agreeId} className="text-left text-xs leading-relaxed text-ube-200">
          I agree to the{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-white underline underline-offset-2 hover:text-ube-300"
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-white underline underline-offset-2 hover:text-ube-300"
          >
            Privacy Policy
          </a>
          .
        </label>
      </div>

      <p
        id={errorId}
        role={status === "error" ? "alert" : undefined}
        aria-live="polite"
        className={`mt-2.5 min-h-[1.25rem] text-left text-xs sm:text-center ${
          status === "error" ? "text-ube-300" : "text-ube-200/70"
        }`}
      >
        {message || "No spam. One email when it launches."}
      </p>
    </form>
  );
}
