"use client";

import { useLanguage } from "@/components/language-provider";

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, m } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      {!compact && <span className="text-xs text-[#94A3B8]">{m.common.language}</span>}
      <div className="inline-flex overflow-hidden rounded-md border border-[#334155]">
        <button
          className={`px-2 py-1 text-xs ${locale === "en" ? "bg-brand-600 text-white" : "bg-transparent text-[#CBD5E1]"}`}
          onClick={() => setLocale("en")}
          type="button"
        >
          EN
        </button>
        <button
          className={`px-2 py-1 text-xs ${locale === "es" ? "bg-brand-600 text-white" : "bg-transparent text-[#CBD5E1]"}`}
          onClick={() => setLocale("es")}
          type="button"
        >
          ES
        </button>
      </div>
    </div>
  );
}
