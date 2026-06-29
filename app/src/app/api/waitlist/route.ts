import { NextResponse } from "next/server";
import { terms } from "@/components/legal/data";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Waitlist signup endpoint.
 *
 * INTEGRATION POINT: this validates the email and accepts the request, but does
 * not yet persist it. Wire one of the following before launch:
 *   - an email provider (Resend / Loops / Buttondown) audience, or
 *   - a `WaitlistSignup` row via the existing Prisma + Supabase setup.
 * Until then, signups are accepted and logged but not stored.
 */
export async function POST(req: Request) {
  let email: unknown;
  let acceptedTerms: unknown;
  try {
    ({ email, acceptedTerms } = await req.json());
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  if (typeof email !== "string" || !EMAIL_RE.test(email.trim())) {
    return NextResponse.json(
      { ok: false, error: "Invalid email" },
      { status: 422 },
    );
  }

  // Clickwrap: agreement is required, and the record of it should be stored
  // alongside the signup (who agreed, to which version, when).
  if (acceptedTerms !== true) {
    return NextResponse.json(
      { ok: false, error: "Terms must be accepted" },
      { status: 422 },
    );
  }

  const consent = {
    email: email.trim().toLowerCase(),
    acceptedTerms: true,
    termsVersion: terms.version,
    agreedAt: new Date().toISOString(),
  };

  // TODO(launch): persist `consent` to a provider or DB (the clickwrap record
  // is what makes the agreement enforceable, so store it, not just the email).
  console.info("[waitlist] signup (not yet persisted):", consent);

  return NextResponse.json({ ok: true, persisted: false });
}
