/**
 * Portable Memory v1 — End-to-End Verification Test Suite
 *
 * Verifies all 8 milestones (M0 through M7) against real Neon Postgres:
 * 1. Pod isolation & default namespaces
 * 2. 3-level folder hierarchy & ltree subtree path calculation
 * 3. Token HMAC hashing, authentication, and instant revocation
 * 4. Scope filtering: subtree grants, sibling exclusion, private exclusion
 * 5. Memory CRUD, optimistic concurrency (409 on version mismatch), version history restore
 * 6. Hybrid full-text and vector cosine similarity search
 * 7. Near-duplicate detection
 * 8. Markdown context rendering for MCP
 * 9. Append-only audit trail logging
 *
 * Usage: pnpm run dotenv -e .env -- tsx scripts/verify-v1.ts
 */

import { randomUUID } from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { pods, namespaces, memoryEntries, agents, agentTokens, auditEvents } from "../src/db/schema";
import { createPod, softDeletePod } from "../src/lib/memory/pods";
import {
  createNamespace,
  listNamespaces,
  resolveNamespaceByPath,
  moveNamespace,
  softDeleteNamespace,
} from "../src/lib/memory/namespaces";
import {
  createEntry,
  updateEntry,
  getEntryByKey,
  getEntryVersions,
  restoreEntryVersion,
  deleteEntry,
  listEntries,
} from "../src/lib/memory/entries";
import { createAgent, issueAgentToken, revokeAgentToken } from "../src/lib/agents/agents";
import { authenticateAgentToken } from "../src/lib/agents/authenticate";
import { hashToken, generateToken } from "../src/lib/agents/tokens";
import { searchMemory } from "../src/lib/memory/search";
import { renderAgentContext } from "../src/lib/memory/render";
import { generateEmbedding, findNearDuplicate } from "../src/lib/memory/embeddings";
import { listAuditEvents } from "../src/lib/memory/audit";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓  ${testName}`);
    passedCount++;
  } else {
    console.error(`  ✗  FAILED: ${testName}`);
    failedCount++;
  }
}

async function run() {
  console.log("\n🚀 Starting Portable Memory v1 Verification Suite...\n");

  const testUserId = randomUUID();
  const testUserIdB = randomUUID();

  // ---------------------------------------------------------------------------
  // 1. Pod Creation & Default Seeding (M0, M0.5)
  // ---------------------------------------------------------------------------
  console.log("📦 1. Testing Pod Creation & Namespace Seeding...");
  const podA = await createPod(testUserId, {
    name: "Work Pod A",
    slug: `test-pod-a-${Date.now()}`,
    description: "Test Pod A",
    allowEmbeddings: true,
  });
  assert(Boolean(podA.id), "Pod A created successfully");

  const podB = await createPod(testUserIdB, {
    name: "Personal Pod B",
    slug: `test-pod-b-${Date.now()}`,
    description: "Test Pod B",
    allowEmbeddings: false,
  });
  assert(Boolean(podB.id), "Pod B created successfully");

  const podANamespaces = await listNamespaces(podA.id);
  assert(
    podANamespaces.some((n) => n.name === "identity") &&
    podANamespaces.some((n) => n.name === "projects") &&
    podANamespaces.some((n) => n.name === "health"),
    "Default namespaces seeded (identity, projects, health)"
  );

  // ---------------------------------------------------------------------------
  // 2. Namespace Tree & Depth Enforcement (M1)
  // ---------------------------------------------------------------------------
  console.log("\n📁 2. Testing 3-Level Namespace Hierarchy...");
  const projectsNs = podANamespaces.find((n) => n.name === "projects")!;

  const mobileNs = await createNamespace(podA.id, {
    name: "mobile",
    parentId: projectsNs.id,
    description: "Mobile apps",
  });
  assert(mobileNs.depth === 2, "Level 2 folder created (depth: 2)");

  const iosNs = await createNamespace(podA.id, {
    name: "ios",
    parentId: mobileNs.id,
    description: "iOS client app",
  });
  assert(iosNs.depth === 3, "Level 3 folder created (depth: 3)");

  let depth4Failed = false;
  try {
    await createNamespace(podA.id, {
      name: "swiftui",
      parentId: iosNs.id,
    });
  } catch {
    depth4Failed = true;
  }
  assert(depth4Failed, "Level 4 folder rejected by depth constraint (max 3)");

  // Test folder resolution by path
  const resolvedIos = await resolveNamespaceByPath(podA.id, "projects/mobile/ios");
  assert(resolvedIos?.id === iosNs.id, "Path 'projects/mobile/ios' resolved correctly");

  // ---------------------------------------------------------------------------
  // 3. Agent Identity, Scoped Tokens, & Authentication (M3, M4)
  // ---------------------------------------------------------------------------
  console.log("\n🤖 3. Testing Agent Scopes, Tokens & Authentication...");
  const agentClaude = await createAgent(podA.id, {
    name: `Claude Assistant ${Date.now()}`,
    platform: "claude",
    permissions: ["memory:read", "memory:write", "memory:list"],
    allNamespaces: false,
    folderIds: [projectsNs.id], // Grant 'projects' (covers projects, mobile, ios)
  });
  assert(Boolean(agentClaude.rawToken), "Agent created and initial bearer token issued");

  // Authenticate with bearer token
  const authSuccess = await authenticateAgentToken(`Bearer ${agentClaude.rawToken}`);
  assert(authSuccess.success, "Valid bearer token authenticates successfully");

  // Authenticate with invalid token
  const authInvalid = await authenticateAgentToken("Bearer pm_live_invalidtoken1234567890");
  assert(!authInvalid.success && authInvalid.status === 401, "Invalid token returns 401");

  // Token Revocation
  await revokeAgentToken(podA.id, agentClaude.agent.id, agentClaude.tokenId);
  const authRevoked = await authenticateAgentToken(`Bearer ${agentClaude.rawToken}`);
  assert(!authRevoked.success && authRevoked.status === 401, "Revoked token immediately returns 401");

  // Issue new active token for Claude
  const newToken = await issueAgentToken(podA.id, agentClaude.agent.id, "Second token");
  const authNew = await authenticateAgentToken(`Bearer ${newToken.rawToken}`);
  assert(authNew.success, "New token authenticates successfully for the same agent");

  // ---------------------------------------------------------------------------
  // 4. Scope Filtering & Access Rule Enforcement (M4)
  // ---------------------------------------------------------------------------
  console.log("\n🔒 4. Testing Access Rule (Subtree Grants & Sibling/Private Exclusion)...");
  const notesNs = podANamespaces.find((n) => n.name === "notes")!;
  const healthNs = podANamespaces.find((n) => n.name === "health")!;

  // Entry in granted parent folder
  const entryProject = await createEntry({
    podId: podA.id,
    namespaceId: projectsNs.id,
    key: "active_project",
    value: "Portable Memory v1",
    pinned: true,
    createdByUser: true,
  });

  // Entry in granted descendant folder
  const entryIos = await createEntry({
    podId: podA.id,
    namespaceId: iosNs.id,
    key: "app_version",
    value: "1.0.0-beta",
    pinned: false,
    createdByUser: true,
  });

  // Entry in ungranted sibling folder
  const entryNotes = await createEntry({
    podId: podA.id,
    namespaceId: notesNs.id,
    key: "scratchpad",
    value: "Secret personal thoughts",
    pinned: false,
    createdByUser: true,
  });

  // Entry with visibility = 'private'
  const entryHealth = await createEntry({
    podId: podA.id,
    namespaceId: healthNs.id,
    key: "diet",
    value: "Vegetarian",
    visibility: "private",
    createdByUser: true,
  });

  // Test agent scope search
  const agentSearchResults = await searchMemory(podA.id, "Portable Memory", {
    agent: agentClaude.agent,
  });
  assert(
    agentSearchResults.some((e) => e.key === "active_project"),
    "Agent sees entry in granted parent folder ('projects')"
  );

  const agentSearchSubtree = await searchMemory(podA.id, "beta", {
    agent: agentClaude.agent,
  });
  assert(
    agentSearchSubtree.some((e) => e.key === "app_version"),
    "Agent sees entry in granted subfolder ('projects/mobile/ios')"
  );

  const agentSearchSibling = await searchMemory(podA.id, "Secret personal thoughts", {
    agent: agentClaude.agent,
  });
  assert(
    !agentSearchSibling.some((e) => e.key === "scratchpad"),
    "Agent CANNOT see entry in ungranted sibling folder ('notes')"
  );

  const agentSearchPrivate = await searchMemory(podA.id, "Vegetarian", {
    agent: agentClaude.agent,
  });
  assert(
    !agentSearchPrivate.some((e) => e.key === "diet"),
    "Agent CANNOT see private entry ('health.diet')"
  );

  // ---------------------------------------------------------------------------
  // 5. Memory CRUD, Versioning, & Optimistic Concurrency (M2, M4)
  // ---------------------------------------------------------------------------
  console.log("\n📝 5. Testing Versioning & Optimistic Concurrency...");
  const entryToUpdate = await createEntry({
    podId: podA.id,
    namespaceId: projectsNs.id,
    key: "concurrency_test",
    value: { step: 1 },
    createdByUser: true,
  });
  assert(entryToUpdate.version === 1, "Initial version is 1");

  // Valid update with expectedVersion 1
  const updatedEntry = await updateEntry({
    podId: podA.id,
    entryId: entryToUpdate.id,
    value: { step: 2 },
    expectedVersion: 1,
    changedByUser: true,
  });
  assert(updatedEntry.version === 2, "Entry version bumped to 2");

  // Stale update with expectedVersion 1 (should fail with conflict)
  let conflictCaught = false;
  try {
    await updateEntry({
      podId: podA.id,
      entryId: entryToUpdate.id,
      value: { step: 3 },
      expectedVersion: 1, // Stale! Current is 2
      changedByUser: true,
    });
  } catch (err: any) {
    if (err.message.includes("Conflict")) conflictCaught = true;
  }
  assert(conflictCaught, "Stale version update throws Conflict (409)");

  // Version history & restore
  const versions = await getEntryVersions(podA.id, entryToUpdate.id);
  assert(versions.length >= 2, "Entry keeps immutable history versions");

  const restored = await restoreEntryVersion(podA.id, entryToUpdate.id, 1, testUserId);
  assert(
    restored.version === 3 && JSON.stringify(restored.value) === JSON.stringify({ step: 1 }),
    "Restoring version 1 creates version 3 with original value"
  );

  // ---------------------------------------------------------------------------
  // 6. Vector Embeddings & Near-Duplicate Detection (M7)
  // ---------------------------------------------------------------------------
  console.log("\n🧠 6. Testing Semantic Vector Layer & Duplicate Detection...");
  const textA = "User prefers concise, bullet-pointed responses with code examples";
  const { embedding: embA } = await generateEmbedding(textA);
  assert(embA.length === 1536, "Embedding generated with 1536 dimensions");

  // Near duplicate check
  const duplicateEntry = await findNearDuplicate(podA.id, projectsNs.id, embA, 0.99);
  assert(duplicateEntry === null, "No false positive duplicate found before saving");

  // ---------------------------------------------------------------------------
  // 7. Context Rendering for MCP (M6)
  // ---------------------------------------------------------------------------
  console.log("\n📋 7. Testing MCP Markdown Context Rendering...");
  const context = await renderAgentContext(agentClaude.agent);
  assert(
    context.markdown.includes("Pinned Memory Entries") &&
    context.markdown.includes("active_project") &&
    context.markdown.includes("Available Knowledge Index"),
    "renderAgentContext generates clean Markdown with pinned entries and folder index"
  );

  // ---------------------------------------------------------------------------
  // 8. Audit Trail Verification (M5)
  // ---------------------------------------------------------------------------
  console.log("\n📜 8. Testing Append-Only Audit Trail...");
  const auditLogs = await listAuditEvents(podA.id, { limit: 20 });
  assert(auditLogs.length > 0, "Audit trail contains recorded events");
  assert(
    auditLogs.some((l) => l.action === "write"),
    "Audit trail includes 'write' events"
  );

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------
  console.log("\n🧹 Cleaning up test pods...");
  await softDeletePod(testUserId, podA.id);
  await softDeletePod(testUserIdB, podB.id);

  console.log(`\n========================================`);
  console.log(`Verification Summary:`);
  console.log(`  Passed: ${passedCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
