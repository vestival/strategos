"use client";

import Link from "next/link";

import { LanguageToggle } from "@/components/language-toggle";
import { SignInButton } from "@/components/auth-buttons";
import { useLanguage } from "@/components/language-provider";

export function LandingClient({ isSignedIn }: { isSignedIn: boolean }) {
  const { m } = useLanguage();

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="absolute -top-24 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-brand-500/10 blur-3xl dark:bg-brand-500/20" />
      <section className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <div className="absolute right-6 top-6">
          <LanguageToggle />
        </div>
        <p className="mb-4 rounded-full border border-brand-500/30 bg-brand-50 px-4 py-1 text-xs uppercase tracking-[0.2em] text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/10 dark:text-brand-100">
          {m.landing.badge}
        </p>
        <h1 className="mb-4 text-4xl font-bold leading-tight md:text-6xl">{m.landing.title}</h1>
        <p className="mb-8 max-w-2xl text-slate-600 dark:text-slate-300">{m.landing.subtitle}</p>
        {isSignedIn ? (
          <Link className="rounded-lg bg-brand-500 px-4 py-2 text-white hover:bg-brand-700" href="/dashboard">
            {m.landing.openDashboard}
          </Link>
        ) : (
          <SignInButton />
        )}
      </section>
    </main>
  );
}

