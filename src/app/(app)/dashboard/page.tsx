import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/session";
import { Alert } from "@/components/ui/form";

export const metadata: Metadata = { title: "Dashboard" };

const sections = [
  { title: "Memory", description: "Namespaced entries your agents can read and write." },
  { title: "Connections", description: "Scoped tokens for Claude, ChatGPT, and custom agents." },
  { title: "Audit Log", description: "Every read and write, by agent, namespace, and key." },
];

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<div className="h-14 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-900" />}>
        <Greeting />
      </Suspense>

      <section aria-labelledby="pod-heading" className="flex flex-col gap-4">
        <h2 id="pod-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Your Memory Pod
        </h2>
        <ul className="grid gap-4 sm:grid-cols-3">
          {sections.map(({ title, description }) => (
            <li
              key={title}
              className="flex flex-col gap-1 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</span>
              <span className="text-sm text-pretty text-zinc-600 dark:text-zinc-400">{description}</span>
              <span className="mt-2 text-xs text-zinc-500 dark:text-zinc-500">Coming soon</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

async function Greeting() {
  const user = await requireUser();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance break-words text-zinc-900 dark:text-zinc-100">
          Welcome, {user.name}
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          You’re the administrator of your memory. Decide which agents see what.
        </p>
      </div>
      {!user.emailVerified && (
        <Alert tone="info">
          Your email isn’t verified yet.{" "}
          <Link
            href={`/auth/verify-email?email=${encodeURIComponent(user.email)}`}
            className="font-medium underline underline-offset-4"
          >
            Verify Your Email
          </Link>
        </Alert>
      )}
    </div>
  );
}
