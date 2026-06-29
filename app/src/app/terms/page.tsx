import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { terms } from "@/components/legal/data";

export const metadata: Metadata = {
  title: "Terms of Service · Brume",
  description:
    "The terms that govern your use of Brume, a self-custodial Solana wallet, and the related website and services.",
};

export default function TermsPage() {
  return (
    <LegalPage doc={terms} other={{ href: "/privacy", label: "Privacy Policy" }} />
  );
}
