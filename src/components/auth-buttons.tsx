"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";

import { useLanguage } from "@/components/language-provider";

export function SignInButton() {
  const { m } = useLanguage();
  return (
    <button
      className="rounded-lg bg-brand-500 px-4 py-2 text-white hover:bg-brand-700"
      onClick={() => signIn("google", { callbackUrl: "/dashboard" })}
      type="button"
    >
      {m.auth.signInWithGoogle}
    </button>
  );
}

export function UserMenu() {
  const { data } = useSession();
  const { m } = useLanguage();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  if (!data?.user) return null;

  const email = data.user.email ?? "user";
  const label = email.split("@")[0] ?? email;

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-xs font-semibold text-white">
          {label.slice(0, 1).toUpperCase()}
        </span>
        <span className="max-w-[120px] truncate">{label}</span>
        <span aria-hidden="true">▾</span>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-2 border-b border-slate-200 px-2 pb-2 dark:border-slate-700">
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{m.auth.account}</div>
            <div className="truncate text-sm text-slate-700 dark:text-slate-200">{email}</div>
          </div>
          <Link
            className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            href="/dashboard?tab=settings"
            onClick={() => setOpen(false)}
          >
            {m.auth.settings}
          </Link>
          <Link
            className="block rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            href="/wallets"
            onClick={() => setOpen(false)}
          >
            {m.auth.manageWallets}
          </Link>
          <button
            className="mt-1 block w-full rounded-md px-2 py-2 text-left text-sm text-rose-700 hover:bg-rose-50 dark:text-rose-300 dark:hover:bg-rose-950/40"
            onClick={() => signOut({ callbackUrl: "/" })}
            type="button"
          >
            {m.auth.signOut}
          </button>
        </div>
      )}
    </div>
  );
}
