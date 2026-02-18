import type { Metadata } from "next";

import { LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service | Strategos",
  description: "Strategos terms of service."
};

export default function TermsPage() {
  return <LegalPage kind="terms" />;
}
