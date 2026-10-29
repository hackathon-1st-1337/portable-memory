import { Suspense } from "react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/session";
import { listUserPods, ensureDefaultPod } from "@/lib/memory/pods";
import { PodsManager } from "./pods-manager";

export const metadata: Metadata = {
  title: "Memory Pods",
};

export default function PodsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4">
          <div className="h-8 w-48 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="h-44 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
            <div className="h-44 rounded-xl bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
          </div>
        </div>
      }
    >
      <PodsDataLoader />
    </Suspense>
  );
}

async function PodsDataLoader() {
  const user = await requireUser();
  await ensureDefaultPod(user.id);
  const pods = await listUserPods(user.id);

  return <PodsManager initialPods={pods} />;
}
