import Link from "next/link";
import type { ReactNode } from "react";

export function AuthHeading({ title, description }: { title: string; description: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      <h1 className="text-xl font-semibold tracking-tight text-balance text-zinc-900 dark:text-zinc-100">
        {title}
      </h1>
      <p className="text-sm text-pretty text-zinc-600 dark:text-zinc-400">{description}</p>
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-sm font-medium text-zinc-900 underline underline-offset-4 hover:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 dark:text-zinc-100 dark:hover:text-zinc-300 dark:focus-visible:ring-zinc-100"
    >
      {children}
    </Link>
  );
}

/** Placeholder shown while request-time data (search params, session) streams in. */
export function FormSkeleton({ fields }: { fields: number }) {
  return (
    <div aria-busy="true" aria-label="Loading…" className="flex flex-col gap-4 motion-safe:animate-pulse">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-4 w-20 rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-9 rounded-md bg-zinc-100 dark:bg-zinc-900" />
        </div>
      ))}
      <div className="h-9 rounded-md bg-zinc-200 dark:bg-zinc-800" />
    </div>
  );
}
