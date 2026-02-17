"use client";

import { useLanguage } from "@/components/language-provider";

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, m } = useLanguage();

  return (
    <div className="flex items-center gap-2">
      {!compact && <span className="text-xs text-slate-500 dark:text-slate-400">{m.common.language}</span>}
      <div className="inline-flex overflow-hidden rounded-md border border-slate-300 dark:border-slate-700">
        <button
          className={`px-2 py-1 text-xs ${locale === "en" ? "bg-brand-600 text-white" : "bg-transparent text-slate-600 dark:text-slate-300"}`}
          onClick={() => setLocale("en")}
          type="button"
        >
          EN
        </button>
        <button
          className={`px-2 py-1 text-xs ${locale === "es" ? "bg-brand-600 text-white" : "bg-transparent text-slate-600 dark:text-slate-300"}`}
          onClick={() => setLocale("es")}
          type="button"
        >
          ES
        </button>
      </div>
    </div>
  );
}
