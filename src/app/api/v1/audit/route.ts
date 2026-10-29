import { NextRequest, NextResponse } from "next/server";
import { authenticateAgentToken } from "@/lib/agents/authenticate";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureDefaultPod, getPodBySlug } from "@/lib/memory/pods";
import { listAuditEvents } from "@/lib/memory/audit";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");

  // Agent authentication
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const auth = await authenticateAgentToken(authHeader, "audit:read");
    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { agent, pod } = auth.context;
    const events = await listAuditEvents(pod.id, {
      agentId: agent.id,
      limit: 100,
    });
    return NextResponse.json({ events });
  }

  // Human user session authentication
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const podSlug = request.nextUrl.searchParams.get("pod");
  let pod = podSlug ? await getPodBySlug(user.id, podSlug) : null;
  if (!pod) {
    pod = await ensureDefaultPod(user.id);
  }

  const events = await listAuditEvents(pod.id, { limit: 100 });
  return NextResponse.json({ events });
}
