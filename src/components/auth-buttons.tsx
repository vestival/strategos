"use client";

import { signIn, signOut, useSession } from "next-auth/react";
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

  if (!data?.user) return null;

  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-slate-600 dark:text-slate-300">{data.user.email}</span>
      <button
        className="rounded-md border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-800"
        onClick={() => signOut({ callbackUrl: "/" })}
        type="button"
      >
        {m.auth.signOut}
      </button>
    </div>
  );
}
