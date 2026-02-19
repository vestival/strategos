"use client";

import { useMemo } from "react";

import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/components/language-provider";

type LegalSection = {
  title: string;
  body: string[];
};

export function LegalPage({ kind }: { kind: "privacy" | "terms" }) {
  const { locale, m } = useLanguage();
  const dateText = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", {
        dateStyle: "long"
      }).format(new Date()),
    [locale]
  );
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@strategos.vestival.es";
  const content = m.legal[kind] as {
    title: string;
    heading: string;
    lastUpdated: string;
    intro?: string;
    sections: LegalSection[];
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0F172A] dark:text-[#F8FAFC]">
      <div className="mx-auto max-w-4xl px-4 py-10 md:px-8">
        <div className="mb-8 flex items-center justify-between gap-3">
          <h1 className="font-brand text-3xl">{content.title}</h1>
          <LanguageToggle />
        </div>

        <article className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-[#1E293B] dark:bg-[#0B1630]">
          <header className="space-y-2">
            <h2 className="text-2xl font-semibold">{content.heading}</h2>
            <p className="text-sm text-slate-500 dark:text-[#94A3B8]">{content.lastUpdated.replace("{date}", dateText)}</p>
            {content.intro ? <p className="text-slate-600 dark:text-[#CBD5E1]">{content.intro}</p> : null}
          </header>

          {content.sections.map((section) => (
            <section className="space-y-2" key={section.title}>
              <h3 className="text-lg font-semibold">{section.title}</h3>
              {section.body.map((line, idx) => (
                <p className="text-sm leading-6 text-slate-600 dark:text-[#CBD5E1]" key={`${section.title}-${idx}`}>
                  {line.replace("{email}", supportEmail)}
                </p>
              ))}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
