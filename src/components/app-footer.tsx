"use client";

import Link from "next/link";

import { useLanguage } from "@/components/language-provider";

export function AppFooter() {
  const { m } = useLanguage();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[#1E293B] bg-[#0F172A]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 text-sm text-[#CBD5E1] md:flex-row md:items-center md:justify-between md:px-8">
        <div>
          <div className="font-brand text-base text-[#F8FAFC]">{m.common.appName}</div>
          <div className="text-[#94A3B8]">{m.common.tagline}</div>
        </div>
        <nav className="flex items-center gap-4">
          <Link className="hover:text-[#F8FAFC]" href="/">
            {m.common.home}
          </Link>
          <Link className="hover:text-[#F8FAFC]" href="/privacy">
            {m.common.privacy}
          </Link>
          <Link className="hover:text-[#F8FAFC]" href="/terms">
            {m.common.terms}
          </Link>
        </nav>
        <div className="text-[#94A3B8]">{m.common.copyright.replace("{year}", String(year))}</div>
      </div>
    </footer>
  );
}
