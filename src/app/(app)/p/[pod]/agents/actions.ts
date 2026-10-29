"use server";

import { revalidatePath } from "next/cache";
import { requirePod } from "@/lib/memory/pods";
import {
  createAgent,
  updateAgent,
  issueAgentToken,
  revokeAgentToken,
  getAgentById,
} from "@/lib/agents/agents";

export interface AgentFormState {
  error?: string;
  success?: string;
  createdToken?: {
    rawToken: string;
    prefix: string;
    agentName: string;
  };
}

export async function createAgentAction(
  podSlug: string,
  prevState: AgentFormState | null,
  formData: FormData
): Promise<AgentFormState> {
  const { pod } = await requirePod(podSlug);
  const name = formData.get("name")?.toString().trim();
  const platform = formData.get("platform")?.toString().trim() || "custom";
  const description = formData.get("description")?.toString().trim();
  const permissions = formData.getAll("permissions").map(String);
  const allNamespaces = formData.get("allNamespaces") === "true";
  const folderIds = formData.getAll("folderIds").map(String);
  const rateLimitPerMin = Number(formData.get("rateLimitPerMin")) || 60;

  if (!name) return { error: "Agent name is required" };
  if (permissions.length === 0) return { error: "Select at least one permission" };

  try {
    const result = await createAgent(pod.id, {
      name,
      platform,
      description,
      permissions,
      allNamespaces,
      folderIds,
      rateLimitPerMin,
    });

    revalidatePath(`/p/${podSlug}/agents`);
    return {
      success: "Agent connected successfully",
      createdToken: {
        rawToken: result.rawToken,
        prefix: result.prefix,
        agentName: result.agent.name,
      },
    };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to create agent" };
  }
}

export async function updateAgentStatusAction(
  podSlug: string,
  agentId: string,
  status: "active" | "paused" | "revoked"
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await updateAgent(pod.id, agentId, { status });
    revalidatePath(`/p/${podSlug}/agents`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to update agent status" };
  }
}

export async function issueTokenAction(
  podSlug: string,
  agentId: string,
  label?: string
): Promise<{ error?: string; rawToken?: string; prefix?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    const result = await issueAgentToken(pod.id, agentId, label);
    revalidatePath(`/p/${podSlug}/agents`);
    return { rawToken: result.rawToken, prefix: result.prefix };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to issue token" };
  }
}

export async function revokeTokenAction(
  podSlug: string,
  agentId: string,
  tokenId: string
): Promise<{ error?: string }> {
  const { pod } = await requirePod(podSlug);
  try {
    await revokeAgentToken(pod.id, agentId, tokenId);
    revalidatePath(`/p/${podSlug}/agents`);
    return {};
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : "Failed to revoke token" };
  }
}

export async function fetchAgentDetailsAction(podSlug: string, agentId: string) {
  const { pod } = await requirePod(podSlug);
  return getAgentById(pod.id, agentId);
}
