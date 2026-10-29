import { Suspense } from "react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { listUserPods } from "@/lib/memory/pods";
import { PodSwitcherClient } from "./pod-switcher-client";

export function PodSwitcher({ currentSlug }: { currentSlug?: string }) {
  return (
    <Suspense
      fallback={
        <div className="h-8 w-28 rounded-md bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
      }
    >
      <PodSwitcherContent currentSlug={currentSlug} />
    </Suspense>
  );
}

async function PodSwitcherContent({ currentSlug }: { currentSlug?: string }) {
  const user = await getCurrentUser();
  if (!user) return null;

  const pods = await listUserPods(user.id);
  if (pods.length === 0) return null;

  return (
    <PodSwitcherClient
      pods={pods.map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        isDefault: p.isDefault,
      }))}
      currentSlug={currentSlug}
    />
  );
}
