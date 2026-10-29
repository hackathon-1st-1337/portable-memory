import "server-only";

import { createHash, randomBytes } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  oauthClients,
  oauthAuthorizationCodes,
  oauthTokens,
  agents,
  agentTokens,
  type OAuthClient,
} from "@/db/schema";
import { generateToken } from "@/lib/agents/tokens";
import { createAgent, issueAgentToken } from "@/lib/agents/agents";

/**
 * Register or get an OAuth 2.1 client.
 */
export async function getOrCreateOAuthClient(input: {
  clientId: string;
  name: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const [existing] = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, input.clientId))
    .limit(1);

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(oauthClients)
    .values({
      clientId: input.clientId,
      name: input.name,
      redirectUris: input.redirectUris,
    })
    .returning();

  return created;
}

/**
 * Generate an authorization code with PKCE challenge.
 */
export async function createAuthorizationCode(input: {
  clientId: string;
  userId: string;
  podId: string;
  agentId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
}): Promise<string> {
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await db.insert(oauthAuthorizationCodes).values({
    code,
    clientId: input.clientId,
    userId: input.userId,
    podId: input.podId,
    agentId: input.agentId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod || "S256",
    expiresAt,
  });

  return code;
}

/**
 * Exchange an authorization code + PKCE code_verifier for an access token.
 */
export async function exchangeCodeForToken(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  agentId: string;
  podId: string;
}> {
  const [record] = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(
      and(
        eq(oauthAuthorizationCodes.code, input.code),
        eq(oauthAuthorizationCodes.clientId, input.clientId)
      )
    )
    .limit(1);

  if (!record) {
    throw new Error("Invalid or expired authorization code");
  }

  if (record.usedAt) {
    throw new Error("Authorization code has already been used");
  }

  if (record.expiresAt < new Date()) {
    throw new Error("Authorization code has expired");
  }

  if (record.redirectUri !== input.redirectUri) {
    throw new Error("Redirect URI does not match authorization request");
  }

  // Verify PKCE
  if (record.codeChallengeMethod === "S256") {
    const computedChallenge = createHash("sha256")
      .update(input.codeVerifier)
      .digest("base64url");
    if (computedChallenge !== record.codeChallenge) {
      throw new Error("Invalid PKCE code_verifier");
    }
  } else if (record.codeChallengeMethod === "plain") {
    if (input.codeVerifier !== record.codeChallenge) {
      throw new Error("Invalid PKCE code_verifier");
    }
  }

  // Mark code as used
  await db
    .update(oauthAuthorizationCodes)
    .set({ usedAt: new Date() })
    .where(eq(oauthAuthorizationCodes.code, input.code));

  // Issue standard bearer token for the agent
  const { rawToken, prefix, tokenHash } = generateToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(agentTokens).values({
    agentId: record.agentId,
    tokenHash,
    prefix,
    label: `OAuth: ${input.clientId}`,
    expiresAt,
  });

  await db.insert(oauthTokens).values({
    tokenHash,
    agentId: record.agentId,
    clientId: input.clientId,
    expiresAt,
  });

  return {
    accessToken: rawToken,
    tokenType: "Bearer",
    expiresIn: 30 * 24 * 60 * 60,
    agentId: record.agentId,
    podId: record.podId,
  };
}
