import { Suspense } from "react";
import { redirect } from "next/navigation";

export default function PodRootPage({
  params,
}: {
  params: Promise<{ pod: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="h-20 rounded-lg bg-zinc-100 motion-safe:animate-pulse dark:bg-zinc-800" />
      }
    >
      <PodRootRedirect params={params} />
    </Suspense>
  );
}

async function PodRootRedirect({
  params,
}: {
  params: Promise<{ pod: string }>;
}): Promise<null> {
  const { pod } = await params;
  redirect(`/p/${pod}/memory`);
  return null;
}
