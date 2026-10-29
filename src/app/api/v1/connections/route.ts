import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { ensureDefaultPod, getPodBySlug } from "@/lib/memory/pods";
import { listPodAgents, createAgent } from "@/lib/agents/agents";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const podSlug = request.nextUrl.searchParams.get("pod");
  let pod = podSlug ? await getPodBySlug(user.id, podSlug) : null;
  if (!pod) {
    pod = await ensureDefaultPod(user.id);
  }

  const agents = await listPodAgents(pod.id);
  return NextResponse.json({ connections: agents });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const podSlug = request.nextUrl.searchParams.get("pod");
  let pod = podSlug ? await getPodBySlug(user.id, podSlug) : null;
  if (!pod) {
    pod = await ensureDefaultPod(user.id);
  }

  let body: {
    name?: string;
    platform?: string;
    description?: string;
    permissions?: string[];
    allNamespaces?: boolean;
    folderIds?: string[];
    rateLimitPerMin?: number;
  } = {};

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "Agent connection name is required" }, { status: 400 });
  }

  try {
    const result = await createAgent(pod.id, {
      name: body.name,
      platform: body.platform || "custom",
      description: body.description,
      permissions: body.permissions || ["memory:read", "memory:write", "memory:list"],
      allNamespaces: body.allNamespaces ?? false,
      folderIds: body.folderIds,
      rateLimitPerMin: body.rateLimitPerMin,
    });

    return NextResponse.json(
      {
        connection: result.agent,
        token: result.rawToken,
        prefix: result.prefix,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create connection" },
      { status: 400 }
    );
  }
}
