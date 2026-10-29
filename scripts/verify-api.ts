/**
 * REST & MCP Endpoints Verification Script
 *
 * Verifies HTTP Route Handlers:
 * - GET /api/v1/memory
 * - PUT /api/v1/memory/:namespace/:key
 * - GET /api/v1/memory/:namespace/:key
 * - If-Match 409 conflict handling
 * - DELETE /api/v1/memory/:namespace/:key
 * - POST /api/mcp (initialize, tools/list, get_context, save_memory, search_memory, forget_memory)
 * - GET /api/v1/audit
 */

import { NextRequest } from "next/server";
import { GET as memoryListGet } from "../src/app/api/v1/memory/route";
import {
  GET as memoryPathGet,
  PUT as memoryPathPut,
  DELETE as memoryPathDelete,
} from "../src/app/api/v1/memory/[...path]/route";
import { POST as mcpPost, GET as mcpGet } from "../src/app/api/mcp/route";
import { GET as auditGet } from "../src/app/api/v1/audit/route";
import { createPod, softDeletePod } from "../src/lib/memory/pods";
import { createAgent } from "../src/lib/agents/agents";
import { randomUUID } from "crypto";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, name: string) {
  if (condition) {
    console.log(`  ✓  ${name}`);
    passedCount++;
  } else {
    console.error(`  ✗  FAILED: ${name}`);
    failedCount++;
  }
}

async function testApi() {
  console.log("\n🌐 Testing REST & MCP Route Handlers...\n");

  const testUserId = randomUUID();
  const pod = await createPod(testUserId, {
    name: "API Test Pod",
    slug: `api-test-${Date.now()}`,
    allowEmbeddings: true,
  });

  const agent = await createAgent(pod.id, {
    name: `API Bot ${Date.now()}`,
    platform: "claude",
    permissions: ["memory:read", "memory:write", "memory:delete", "memory:list", "audit:read"],
    allNamespaces: true,
  });

  const bearer = `Bearer ${agent.rawToken}`;

  // 1. GET /api/v1/memory (empty list)
  const reqList = new NextRequest("http://localhost:3000/api/v1/memory", {
    headers: { Authorization: bearer },
  });
  const resList = await memoryListGet(reqList);
  assert(resList.status === 200, "GET /api/v1/memory returns 200 OK");
  const dataList = await resList.json();
  assert(Array.isArray(dataList.entries), "GET /api/v1/memory returns entries array");

  // 2. PUT /api/v1/memory/projects/status
  const reqPut = new NextRequest("http://localhost:3000/api/v1/memory/projects/status", {
    method: "PUT",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ value: "In progress - v1 build", pinned: true }),
  });
  const resPut = await memoryPathPut(reqPut, {
    params: Promise.resolve({ path: ["projects", "status"] }),
  });
  assert(resPut.status === 201, "PUT /api/v1/memory/projects/status returns 201 Created");
  const dataPut = await resPut.json();
  assert(dataPut.version === 1, "Created entry is at version 1");

  // 3. GET /api/v1/memory/projects/status
  const reqGet = new NextRequest("http://localhost:3000/api/v1/memory/projects/status", {
    headers: { Authorization: bearer },
  });
  const resGet = await memoryPathGet(reqGet, {
    params: Promise.resolve({ path: ["projects", "status"] }),
  });
  assert(resGet.status === 200, "GET /api/v1/memory/projects/status returns 200 OK");
  const dataGet = await resGet.json();
  assert(dataGet.value === "In progress - v1 build", "GET returns correct entry value");

  // 4. PUT with wrong If-Match (409 Conflict)
  const reqConflict = new NextRequest("http://localhost:3000/api/v1/memory/projects/status", {
    method: "PUT",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
      "If-Match": "99",
    },
    body: JSON.stringify({ value: "Conflict attempt" }),
  });
  const resConflict = await memoryPathPut(reqConflict, {
    params: Promise.resolve({ path: ["projects", "status"] }),
  });
  assert(resConflict.status === 409, "PUT with wrong If-Match returns 409 Conflict");

  // 5. MCP Handshake: initialize
  const reqMcpInit = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {},
    }),
  });
  const resMcpInit = await mcpPost(reqMcpInit);
  assert(resMcpInit.status === 200, "POST /api/mcp initialize returns 200 OK");
  const dataMcpInit = await resMcpInit.json();
  assert(dataMcpInit.result?.serverInfo?.name === "portable-memory", "MCP serverInfo matches portable-memory");

  // 6. MCP: tools/list
  const reqMcpTools = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    }),
  });
  const resMcpTools = await mcpPost(reqMcpTools);
  const dataMcpTools = await resMcpTools.json();
  const toolNames = dataMcpTools.result?.tools?.map((t: any) => t.name) || [];
  assert(
    toolNames.includes("get_context") &&
    toolNames.includes("get_memory") &&
    toolNames.includes("save_memory") &&
    toolNames.includes("search_memory") &&
    toolNames.includes("forget_memory"),
    "MCP tools/list returns all 5 tools (get_context, get_memory, save_memory, search_memory, forget_memory)"
  );

  // 7. MCP: tools/call get_context
  const reqMcpCallContext = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "get_context",
        arguments: {},
      },
    }),
  });
  const resMcpCallContext = await mcpPost(reqMcpCallContext);
  const dataMcpCallContext = await resMcpCallContext.json();
  const contextText = dataMcpCallContext.result?.content?.[0]?.text || "";
  assert(contextText.includes("Pinned Memory Entries"), "MCP get_context returns Markdown with pinned entries");

  // 8. MCP: tools/call save_memory
  const reqMcpSave = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "save_memory",
        arguments: {
          folder: "preferences",
          key: "theme",
          value: "dark",
          pinned: true,
        },
      },
    }),
  });
  const resMcpSave = await mcpPost(reqMcpSave);
  const dataMcpSave = await resMcpSave.json();
  assert(
    dataMcpSave.result?.content?.[0]?.text?.includes("Successfully saved"),
    "MCP save_memory executes and saves entry"
  );

  // 9. MCP: tools/call search_memory
  const reqMcpSearch = new NextRequest("http://localhost:3000/api/mcp", {
    method: "POST",
    headers: {
      Authorization: bearer,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "search_memory",
        arguments: {
          query: "dark",
        },
      },
    }),
  });
  const resMcpSearch = await mcpPost(reqMcpSearch);
  const dataMcpSearch = await resMcpSearch.json();
  assert(
    dataMcpSearch.result?.content?.[0]?.text?.includes("preferences") &&
    dataMcpSearch.result?.content?.[0]?.text?.includes("theme"),
    "MCP search_memory finds saved entry"
  );

  // 10. GET /api/v1/audit with agent token
  const reqAudit = new NextRequest("http://localhost:3000/api/v1/audit", {
    headers: { Authorization: bearer },
  });
  const resAudit = await auditGet(reqAudit);
  assert(resAudit.status === 200, "GET /api/v1/audit with agent token returns 200 OK");
  const dataAudit = await resAudit.json();
  assert(dataAudit.events?.length > 0, "Audit endpoint returns agent's logged operations");

  // 11. DELETE /api/v1/memory/projects/status
  const reqDelete = new NextRequest("http://localhost:3000/api/v1/memory/projects/status", {
    method: "DELETE",
    headers: { Authorization: bearer },
  });
  const resDelete = await memoryPathDelete(reqDelete, {
    params: Promise.resolve({ path: ["projects", "status"] }),
  });
  assert(resDelete.status === 200, "DELETE /api/v1/memory/projects/status returns 200 OK");

  // Cleanup
  await softDeletePod(testUserId, pod.id);

  console.log(`\n========================================`);
  console.log(`API Verification Summary:`);
  console.log(`  Passed: ${passedCount}`);
  console.log(`  Failed: ${failedCount}`);
  console.log(`========================================\n`);

  if (failedCount > 0) {
    process.exit(1);
  }
}

testApi().catch((err) => {
  console.error("API test crashed:", err);
  process.exit(1);
});
