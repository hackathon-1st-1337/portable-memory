"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth/client";
import { buttonClass } from "@/components/ui/styles";

// Client-side so "/" stays fully static: the server never reads the session for this page.
export function HeroActions() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <div className="h-10 w-64" aria-hidden="true" />;

  if (session?.user) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard" className={buttonClass("primary")}>
          Open Dashboard
        </Link>
        <span className="min-w-0 truncate text-sm text-zinc-600 dark:text-zinc-400">
          Signed in as <span className="font-medium text-zinc-900 dark:text-zinc-100">{session.user.name}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Link href="/auth/sign-up" className={buttonClass("primary")}>
        Create Your Memory Pod
      </Link>
      <Link href="/auth/sign-in" className={buttonClass("secondary")}>
        Sign In
      </Link>
    </div>
  );
}
