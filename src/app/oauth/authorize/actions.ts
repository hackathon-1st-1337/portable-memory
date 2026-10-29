"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getOrCreateOAuthClient, createAuthorizationCode } from "@/lib/oauth/server";
import { createAgent } from "@/lib/agents/agents";
import { db } from "@/db/client";
import { pods } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function authorizeOAuthClientAction(formData: FormData) {
  const user = await requireUser();

  const clientId = String(formData.get("client_id") || "").trim();
  const redirectUri = String(formData.get("redirect_uri") || "").trim();
  const codeChallenge = String(formData.get("code_challenge") || "").trim();
  const codeChallengeMethod = String(formData.get("code_challenge_method") || "S256").trim();
  const state = String(formData.get("state") || "").trim();
  const podId = String(formData.get("pod_id") || "").trim();
  const canWrite = formData.get("permission_write") === "on";

  if (!clientId || !redirectUri || !codeChallenge || !podId) {
    throw new Error("Missing required authorization parameters");
  }

  // Verify pod belongs to user
  const [pod] = await db
    .select()
    .from(pods)
    .where(and(eq(pods.id, podId), eq(pods.ownerUserId, user.id)))
    .limit(1);

  if (!pod) {
    throw new Error("Selected pod does not exist or access denied");
  }

  // Ensure OAuth client is registered or tracked
  await getOrCreateOAuthClient({
    clientId,
    name: clientId,
    redirectUris: [redirectUri],
  });

  // Create an agent connection for this client
  const permissions = ["memory:read"];
  if (canWrite) {
    permissions.push("memory:write");
  }

  const { agent } = await createAgent(pod.id, {
    name: `OAuth: ${clientId}`,
    platform: "oauth",
    description: `Connected via OAuth 2.1 to client ${clientId}`,
    permissions,
    allNamespaces: true,
  });

  // Issue authorization code
  const code = await createAuthorizationCode({
    clientId,
    userId: user.id,
    podId: pod.id,
    agentId: agent.id,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("code", code);
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  redirect(redirectUrl.toString());
}

export async function denyOAuthClientAction(formData: FormData) {
  const redirectUri = String(formData.get("redirect_uri") || "").trim();
  const state = String(formData.get("state") || "").trim();

  if (!redirectUri) {
    redirect("/dashboard");
  }

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set("error", "access_denied");
  redirectUrl.searchParams.set("error_description", "The user denied the authorization request");
  if (state) {
    redirectUrl.searchParams.set("state", state);
  }

  redirect(redirectUrl.toString());
}
