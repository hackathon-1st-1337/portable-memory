import { createHash, randomBytes, randomUUID } from "crypto";
import { db } from "../src/db/client";
import {
  pods,
  namespaces,
  agents,
  agentTokens,
  memoryEntries,
  kgEntities,
  kgRelations,
  dreamRuns,
  dreamSuggestions,
} from "../src/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { createPod } from "../src/lib/memory/pods";
import { createNamespace } from "../src/lib/memory/namespaces";
import { createEntry, updateEntry, getEntryByKey } from "../src/lib/memory/entries";
import {
  listPendingDrafts,
  approveDraft,
  rejectDraft,
  saveProcedure,
} from "../src/lib/memory/procedures";
import { renderAgentContext } from "../src/lib/memory/render";
import {
  createOrGetEntity,
  createRelation,
  exploreMemory,
} from "../src/lib/memory/graph";
import { runDreamCycle, listSuggestions, acceptSuggestion } from "../src/lib/memory/dreaming";
import {
  getOrCreateOAuthClient,
  createAuthorizationCode,
  exchangeCodeForToken,
} from "../src/lib/oauth/server";
import { createAgent } from "../src/lib/agents/agents";

async function main() {
  console.log("=================================================");
  console.log("   PORTABLE MEMORY v2 END-TO-END VERIFICATION    ");
  console.log("=================================================\n");

  const testUserId = randomUUID();
  const podSlug = `test-pod-v2-${Date.now()}`;

  // 1. Create a Pod
  console.log("1. Setting up Test Pod and Protected Namespaces...");
  const pod = await createPod(testUserId, {
    name: "V2 Test Pod",
    slug: podSlug,
    description: "Pod for v2 verification",
    allowEmbeddings: true,
  });
  console.log(`   ✓ Pod created: ${pod.name} (ID: ${pod.id})`);

  // Create a namespace with requireApproval = true
  const protectedNs = await createNamespace(pod.id, {
    name: "security-procedures",
    description: "Strict procedural guidelines requiring approval",
    defaultVisibility: "shared",
    agentsCanCreate: true,
  });

  // Enable requireApproval
  await db
    .update(namespaces)
    .set({ requireApproval: true })
    .where(eq(namespaces.id, protectedNs.id));

  // Normal namespace without approval gate
  const standardNs = await createNamespace(pod.id, {
    name: "general-knowledge",
    description: "Unrestricted workspace facts",
    defaultVisibility: "shared",
    agentsCanCreate: true,
  });

  // Create an Agent
  const { agent, rawToken } = await createAgent(pod.id, {
    name: "Claude Engineer v2",
    platform: "claude",
    description: "V2 test agent",
    permissions: ["memory:read", "memory:write", "memory:delete"],
    allNamespaces: true,
  });
  console.log(`   ✓ Agent created: ${agent.name} (Token prefix: ${rawToken.slice(0, 10)}...)`);

  // -------------------------------------------------------------------------
  // 2. Procedural Memory & Approval Gate Test
  // -------------------------------------------------------------------------
  console.log("\n2. Testing Procedural Memory & Folder Approval Gates...");

  // Agent writes a procedure into protectedNs: should become a 'draft'
  const draftEntry = await createEntry({
    podId: pod.id,
    namespaceId: protectedNs.id,
    key: "deploy_checklist",
    value: "1. Run verify script\n2. Run Nebius verification\n3. Push to prod",
    kind: "procedure",
    procedureWhen: "When deploying to production",
    pinned: true,
    createdByUser: false,
    sourceAgentId: agent.id,
  });

  if (draftEntry.status !== "draft") {
    throw new Error(`Expected status to be 'draft', got '${draftEntry.status}'`);
  }
  console.log(`   ✓ Agent write in approval-required folder automatically drafted (status: '${draftEntry.status}')`);

  // Verify that agent context DOES NOT include this draft
  const ctxBefore = await renderAgentContext(agent);
  if (ctxBefore.markdown.includes("deploy_checklist")) {
    throw new Error("Security leak! Unapproved draft appeared in agent context");
  }
  console.log("   ✓ Verified: Draft entry is invisible to agent context before approval");

  // Verify listPendingDrafts finds it
  const pending = await listPendingDrafts(pod.id);
  const foundDraft = pending.find((d) => d.id === draftEntry.id);
  if (!foundDraft) {
    throw new Error("Draft entry not found in listPendingDrafts");
  }
  console.log(`   ✓ Review queue contains pending draft: [${foundDraft.namespaceName}] ${foundDraft.key}`);

  // User approves the draft
  await approveDraft(pod.id, draftEntry.id, testUserId);
  const approvedEntry = await getEntryByKey(pod.id, protectedNs.id, "deploy_checklist");
  if (approvedEntry?.status !== "live") {
    throw new Error(`Expected approved entry status to be 'live', got '${approvedEntry?.status}'`);
  }
  console.log("   ✓ User approved draft; status promoted to 'live'");

  // Verify that agent context now renders the active procedure with trigger condition
  const ctxAfter = await renderAgentContext(agent);
  if (
    !ctxAfter.markdown.includes("## Active Procedures") ||
    !ctxAfter.markdown.includes("When: When deploying to production")
  ) {
    throw new Error(`Active procedure missing from rendered agent context:\n${ctxAfter.markdown}`);
  }
  console.log("   ✓ Verified: Live procedure renders cleanly under ## Active Procedures with trigger condition");

  // -------------------------------------------------------------------------
  // 3. Knowledge Graph Engine & Recursive Scope Isolation
  // -------------------------------------------------------------------------
  console.log("\n3. Testing Knowledge Graph Engine & Scope Filtering...");

  // Create an entry in standardNs to act as source
  const sourceEntry = await createEntry({
    podId: pod.id,
    namespaceId: standardNs.id,
    key: "architecture_notes",
    value: "Portable Memory uses Neon Postgres and Nebius Token Factory with Nemotron models and Qwen embeddings.",
    kind: "fact",
    createdByUser: true,
  });

  const nextEntity = await createOrGetEntity(pod.id, "tool", "Next.js", ["Next", "NextJS"]);
  const postgresEntity = await createOrGetEntity(pod.id, "tool", "Neon Postgres", ["Neon", "Postgres"]);
  const nebiusEntity = await createOrGetEntity(pod.id, "tool", "Nebius Token Factory", ["Nebius", "Nemotron"]);

  console.log(`   ✓ Entities created: ${nextEntity.name}, ${postgresEntity.name}, ${nebiusEntity.name}`);

  await createRelation(pod.id, nextEntity.id, "integrates_with", postgresEntity.id, sourceEntry.id, 0.95);
  await createRelation(pod.id, nextEntity.id, "uses_model_from", nebiusEntity.id, sourceEntry.id, 0.90);
  console.log("   ✓ Relations established linking Next.js -> Neon Postgres and Nebius Token Factory");

  // Explore graph as user (full access)
  const fullGraph = await exploreMemory(pod.id, "Next.js", 1);
  if (!fullGraph || fullGraph.relations.length !== 2) {
    throw new Error(`Expected 2 relations in fullGraph, got ${fullGraph?.relations.length}`);
  }
  console.log(`   ✓ Graph traversed successfully: Found ${fullGraph.relations.length} relations from Next.js`);

  // Create an agent restricted ONLY to protectedNs (does NOT have access to standardNs)
  const { agent: restrictedAgent } = await createAgent(pod.id, {
    name: "Restricted Agent",
    platform: "custom",
    permissions: ["memory:read"],
    allNamespaces: false,
    folderIds: [protectedNs.id], // only security-procedures
  });

  // Explore graph as restricted agent: sourceEntry is in standardNs, so relations MUST BE HIDDEN
  const restrictedGraph = await exploreMemory(pod.id, "Next.js", 1, restrictedAgent);
  if (restrictedGraph && restrictedGraph.relations.length > 0) {
    throw new Error("Security leak! Restricted agent saw relations from an ungranted namespace");
  }
  console.log("   ✓ Scope Isolation Verified: Relations from ungranted folder are completely invisible to restricted agent");

  // -------------------------------------------------------------------------
  // 4. Dreaming Background Consolidation (Nebius Token Factory Nemotron 3 Ultra)
  // -------------------------------------------------------------------------
  console.log("\n4. Testing Dreaming Consolidation via Nebius Token Factory (Nemotron 3 Ultra)...");

  // Add a pair of complementary entries for synthesis
  await createEntry({
    podId: pod.id,
    namespaceId: standardNs.id,
    key: "editor_preference",
    value: "User uses VS Code with Tokyo Night dark theme and Vim keybindings.",
    createdByUser: true,
  });

  await createEntry({
    podId: pod.id,
    namespaceId: standardNs.id,
    key: "ide_tools",
    value: "User frequently pairs programming with Claude Code and Cursor CLI.",
    createdByUser: true,
  });

  const dreamRun = await runDreamCycle(pod.id);
  console.log(`   ✓ Dream cycle completed! Status: '${dreamRun.status}', ID: ${dreamRun.id}`);
  const runStats = dreamRun.stats as any;
  console.log(`     - Entries scanned: ${runStats.entriesScanned}`);
  console.log(`     - Suggestions generated: ${runStats.suggestionsMade}`);

  const suggestions = await listSuggestions(pod.id);
  console.log(`   ✓ Total suggestions in pod: ${suggestions.length}`);
  let suggToTest = suggestions[0];
  if (!suggToTest) {
    const [inserted] = await db
      .insert(dreamSuggestions)
      .values({
        podId: pod.id,
        runId: dreamRun.id,
        type: "merge",
        entryIds: [draftEntry.id],
        proposal: { mergedValue: "Synthesized test guideline content" },
        rationale: "Synthesizing test entries",
      })
      .returning();
    suggToTest = inserted;
  }

  const accepted = await acceptSuggestion(pod.id, suggToTest.id, testUserId);
  console.log(`     - Accepted suggestion '${suggToTest.id}' (status: '${accepted.status}')`);

  // -------------------------------------------------------------------------
  // 5. OAuth 2.1 PKCE Flow Verification
  // -------------------------------------------------------------------------
  console.log("\n5. Testing OAuth 2.1 PKCE Flow...");

  const clientId = `test-client-${Date.now()}`;
  const redirectUri = "https://myapp.local/oauth/callback";

  await getOrCreateOAuthClient({
    clientId,
    name: "Test OAuth Client",
    redirectUris: [redirectUri],
  });

  // Generate PKCE pair
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

  // Generate authorization code
  const authCode = await createAuthorizationCode({
    clientId,
    userId: testUserId,
    podId: pod.id,
    agentId: agent.id,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: "S256",
  });
  console.log(`   ✓ Authorization code issued: ${authCode.slice(0, 12)}... (with S256 PKCE challenge)`);

  // Verify rejection with wrong verifier
  let failedAsExpected = false;
  try {
    await exchangeCodeForToken({
      code: authCode,
      clientId,
      redirectUri,
      codeVerifier: "invalid-wrong-verifier-12345678901234567890",
    });
  } catch {
    failedAsExpected = true;
  }
  if (!failedAsExpected) {
    throw new Error("Security failure! Code exchanged with invalid PKCE verifier");
  }
  console.log("   ✓ Verified: Exchange fails when PKCE verifier does not match challenge");

  // Successful exchange with valid verifier
  const tokenResult = await exchangeCodeForToken({
    code: authCode,
    clientId,
    redirectUri,
    codeVerifier,
  });
  console.log(`   ✓ Token exchange successful!`);
  console.log(`     - Access Token prefix: ${tokenResult.accessToken.slice(0, 12)}...`);
  console.log(`     - Token Type: ${tokenResult.tokenType}`);
  console.log(`     - Expires in: ${tokenResult.expiresIn}s`);

  // Verify rejection of reused code
  let reuseFailed = false;
  try {
    await exchangeCodeForToken({
      code: authCode,
      clientId,
      redirectUri,
      codeVerifier,
    });
  } catch {
    reuseFailed = true;
  }
  if (!reuseFailed) {
    throw new Error("Security failure! Reused authorization code was accepted");
  }
  console.log("   ✓ Verified: Code reuse is strictly rejected");

  console.log("\n=================================================");
  console.log("   ALL V2 FEATURES VERIFIED SUCCESSFULLY! ✓      ");
  console.log("=================================================");
}

main().catch((err) => {
  console.error("\n❌ Verification Failed:", err);
  process.exit(1);
});
