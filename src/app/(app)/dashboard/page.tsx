import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { ensureDefaultPod } from "@/lib/memory/pods";

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="h-24 rounded-lg bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
      }
    >
      <DashboardRedirect />
    </Suspense>
  );
}

async function DashboardRedirect(): Promise<null> {
  const user = await requireUser();
  const pod = await ensureDefaultPod(user.id);
  redirect(`/p/${pod.slug}/memory`);
  return null;
}

