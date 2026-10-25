import { Suspense, type ReactNode } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { ProfileForm, PasswordForm, SessionList } from "./forms";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">Account</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Manage how you sign in to your memory pod.
        </p>
      </div>

      <Section id="profile" title="Profile" description="Your name appears in this dashboard only.">
        <Suspense fallback={<PanelSkeleton />}>
          <Profile />
        </Suspense>
      </Section>

      <Section
        id="password"
        title="Password"
        description="Changing your password signs you out on every other device."
      >
        <Suspense fallback={<PanelSkeleton />}>
          <Password />
        </Suspense>
      </Section>

      <Section
        id="sessions"
        title="Active Sessions"
        description="Devices currently signed in to your account. Sign out any you don’t recognize."
      >
        <SessionList />
      </Section>
    </div>
  );
}

async function Profile() {
  const user = await requireUser();
  return <ProfileForm name={user.name} email={user.email} emailVerified={user.emailVerified} />;
}

async function Password() {
  const user = await requireUser();
  return <PasswordForm email={user.email} />;
}

function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="grid gap-4 rounded-xl border border-zinc-200 bg-white p-6 md:grid-cols-[1fr_2fr] md:gap-8 dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`${id}-heading`} className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        <p className="text-sm text-pretty text-zinc-600 dark:text-zinc-400">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function PanelSkeleton() {
  return <div aria-hidden="true" className="h-24 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-900" />;
}
