import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureDefaultPod, getPodBySlug } from "@/lib/memory/pods";
import { updateAgent } from "@/lib/agents/agents";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const podSlug = request.nextUrl.searchParams.get("pod");
  let pod = podSlug ? await getPodBySlug(user.id, podSlug) : null;
  if (!pod) {
    pod = await ensureDefaultPod(user.id);
  }

  try {
    await updateAgent(pod.id, id, { status: "revoked" });
    return NextResponse.json({ ok: true, status: "revoked" });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to revoke connection" },
      { status: 400 }
    );
  }
}
