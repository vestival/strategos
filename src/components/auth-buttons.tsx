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

  const email = data.user.email ?? m.auth.userFallback;
  const label = email.split("@")[0] ?? email;

  return (
    <div className="relative" ref={containerRef}>
      <button
        className="inline-flex items-center gap-2 rounded-md border border-[#334155] px-3 py-2 text-sm text-[#CBD5E1] hover:bg-[#1E293B]"
        aria-label={m.auth.openMenu}
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
        <div className="absolute right-0 z-30 mt-2 w-64 rounded-lg border border-[#1E293B] bg-[#0B1630] p-2 shadow-lg">
          <div className="mb-2 border-b border-[#1E293B] px-2 pb-2">
            <div className="text-xs uppercase tracking-wide text-[#94A3B8]">{m.auth.account}</div>
            <div className="truncate text-sm text-[#F8FAFC]">{email}</div>
          </div>
          <Link
            className="block rounded-md px-2 py-2 text-sm text-[#CBD5E1] hover:bg-[#1E293B]"
            href="/dashboard?tab=settings"
            onClick={() => setOpen(false)}
          >
            {m.auth.settings}
          </Link>
          <Link
            className="block rounded-md px-2 py-2 text-sm text-[#CBD5E1] hover:bg-[#1E293B]"
            href="/wallets"
            onClick={() => setOpen(false)}
          >
            {m.auth.manageWallets}
          </Link>
          <button
            className="mt-1 block w-full rounded-md px-2 py-2 text-left text-sm text-rose-300 hover:bg-rose-950/40"
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
