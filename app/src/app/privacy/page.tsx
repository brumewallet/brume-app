import type { Metadata } from "next";
import { LegalPage } from "@/components/legal/legal-page";
import { privacy } from "@/components/legal/data";

export const metadata: Metadata = {
  title: "Privacy Policy · Brume",
  description:
    "How Brume handles the little data it processes, what it never collects, and the rights you have over your data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage doc={privacy} other={{ href: "/terms", label: "Terms of Service" }} />
  );
}
