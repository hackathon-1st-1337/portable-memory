import "server-only";
import { notFound } from "next/navigation";
import { eq, and, isNull, desc } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db } from "@/db/client";
import { pods, namespaces, type Pod } from "@/db/schema";
import { requireUser, type CurrentUser } from "@/lib/auth/session";
import { sanitizeSlug } from "./sanitize";

export const DEFAULT_NAMESPACES = [
  {
    name: "identity",
    description: "Who the user is: name, background, role, bio",
    defaultVisibility: "shared",
  },
  {
    name: "preferences",
    description: "General communication, tool, tone, and working preferences",
    defaultVisibility: "shared",
  },
  {
    name: "projects",
    description: "Active and past projects, goals, repositories, and context",
    defaultVisibility: "shared",
  },
  {
    name: "work",
    description: "Company, team, responsibilities, and professional context",
    defaultVisibility: "shared",
  },
  {
    name: "health",
    description: "Dietary preferences, ergonomics, fitness, wellness",
    defaultVisibility: "private",
  },
  {
    name: "notes",
    description: "General thoughts, scratch notes, and miscellaneous facts",
    defaultVisibility: "shared",
  },
] as const;

/** List all active pods owned by the user */
export async function listUserPods(userId: string): Promise<Pod[]> {
  return db
    .select()
    .from(pods)
    .where(and(eq(pods.ownerUserId, userId), isNull(pods.deletedAt)))
    .orderBy(desc(pods.isDefault), pods.createdAt);
}

/** Get a pod by user ID and slug */
export async function getPodBySlug(
  userId: string,
  slug: string
): Promise<Pod | null> {
  const sanitized = sanitizeSlug(slug);
  const rows = await db
    .select()
    .from(pods)
    .where(
      and(
        eq(pods.ownerUserId, userId),
        eq(pods.slug, sanitized),
        isNull(pods.deletedAt)
      )
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Ensures the user has at least one default pod ("Personal").
 * Safe to call idempotently on dashboard load.
 */
export async function ensureDefaultPod(userId: string): Promise<Pod> {
  const existing = await listUserPods(userId);
  if (existing.length > 0) {
    const defaultPod = existing.find((p) => p.isDefault) ?? existing[0];
    return defaultPod;
  }

  return createPod(userId, {
    name: "Personal",
    slug: "personal",
    description: "Your primary personal memory pod",
    isDefault: true,
  });
}

/**
 * Authorize the human user and resolve the pod by slug.
 * Returns 404 (not 403) if the pod does not exist or belongs to someone else,
 * preventing pod ID/slug enumeration.
 */
export async function requirePod(
  slug: string
): Promise<{ user: CurrentUser; pod: Pod }> {
  const user = await requireUser();
  const pod = await getPodBySlug(user.id, slug);

  if (!pod) {
    notFound();
  }

  return { user, pod };
}

/**
 * Create a new pod and seed it with default namespaces.
 */
export async function createPod(
  userId: string,
  data: {
    name: string;
    slug: string;
    description?: string;
    isDefault?: boolean;
    allowEmbeddings?: boolean;
  }
): Promise<Pod> {
  const slug = sanitizeSlug(data.slug);
  const name = data.name.trim();
  if (!name) {
    throw new Error("Pod name cannot be empty");
  }

  // Check if user has any pods yet; if not, force isDefault = true
  const existing = await listUserPods(userId);
  const isDefault = data.isDefault ?? existing.length === 0;

  // Insert the pod
  const [pod] = await db
    .insert(pods)
    .values({
      ownerUserId: userId,
      name,
      slug,
      description: data.description?.trim() || null,
      isDefault,
      allowEmbeddings: data.allowEmbeddings ?? false,
    })
    .returning();

  // Seed default namespaces
  for (const ns of DEFAULT_NAMESPACES) {
    const id = randomUUID();
    const ltreeLabel = `n_${id.replace(/-/g, "_")}`;

    await db.insert(namespaces).values({
      id,
      podId: pod.id,
      parentId: null,
      name: ns.name,
      path: ltreeLabel,
      depth: 1,
      description: ns.description,
      defaultVisibility: ns.defaultVisibility,
      agentsCanCreate: true,
    });
  }

  return pod;
}

/**
 * Update pod details.
 */
export async function updatePod(
  userId: string,
  podId: string,
  data: {
    name?: string;
    description?: string;
    allowEmbeddings?: boolean;
  }
): Promise<Pod> {
  const updates: Partial<typeof pods.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) {
    const name = data.name.trim();
    if (!name) throw new Error("Pod name cannot be empty");
    updates.name = name;
  }

  if (data.description !== undefined) {
    updates.description = data.description.trim() || null;
  }

  if (data.allowEmbeddings !== undefined) {
    updates.allowEmbeddings = data.allowEmbeddings;
  }

  const [updated] = await db
    .update(pods)
    .set(updates)
    .where(
      and(
        eq(pods.id, podId),
        eq(pods.ownerUserId, userId),
        isNull(pods.deletedAt)
      )
    )
    .returning();

  if (!updated) {
    throw new Error("Pod not found");
  }

  return updated;
}

/**
 * Set a pod as the default for the user.
 */
export async function setDefaultPod(userId: string, podId: string): Promise<void> {
  // Clear other defaults first
  await db
    .update(pods)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(eq(pods.ownerUserId, userId), eq(pods.isDefault, true)));

  // Set selected as default
  await db
    .update(pods)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(
      and(
        eq(pods.id, podId),
        eq(pods.ownerUserId, userId),
        isNull(pods.deletedAt)
      )
    );
}

/**
 * Soft delete a pod. This immediately blocks all of that pod's agents.
 */
export async function softDeletePod(userId: string, podId: string): Promise<void> {
  const [deleted] = await db
    .update(pods)
    .set({
      deletedAt: new Date(),
      isDefault: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pods.id, podId),
        eq(pods.ownerUserId, userId),
        isNull(pods.deletedAt)
      )
    )
    .returning();

  if (!deleted) {
    throw new Error("Pod not found");
  }

  // If the deleted pod was default, set another pod as default if one exists
  const remaining = await listUserPods(userId);
  if (remaining.length > 0 && !remaining.some((p) => p.isDefault)) {
    await setDefaultPod(userId, remaining[0].id);
  }
}
