# Portable Memory

> **One memory. Every AI. Your rules.**  
> *A sovereign, user-owned context engine powered by NVIDIA Nemotron models on Nebius Token Factory.*

[![Live App](https://img.shields.io/badge/Live%20App-portable--memory.vercel.app-blue?style=for-the-badge&logo=vercel)](https://portable-memory.vercel.app)
[![Nebius Token Factory](https://img.shields.io/badge/AI%20Inference-Nebius%20Token%20Factory-7928CA?style=for-the-badge&logo=nvidia)](https://tokenfactory.nebius.com)
[![Neon](https://img.shields.io/badge/Database-Neon%20Postgres%20%2B%20pgvector-00E599?style=for-the-badge&logo=postgresql)](https://neon.com)
[![Protocol](https://img.shields.io/badge/Protocol-Model%20Context%20Protocol%20(MCP)-orange?style=for-the-badge)](https://modelcontextprotocol.io)

AI assistants are amnesiacs by default. Every time you open a new chat with Claude, ChatGPT, Cursor, or an autonomous agent, they start from zero. You are forced to re-explain your preferences, your coding guidelines, your architectural decisions, and your ongoing projects.

**Portable Memory** gives you a single personal memory store that travels with you across any AI platform. You own the data, you define the folder permissions, you approve sensitive changes, and every read and write is recorded in a cryptographic audit log.

---

## 🚀 Live Production & MCP Server

- **Web Dashboard:** [https://portable-memory.vercel.app](https://portable-memory.vercel.app)
- **MCP Server Endpoint:** `https://portable-memory.vercel.app/api/mcp`
- **Protocol:** Model Context Protocol (MCP `2024-11-05`) + OAuth 2.1 PKCE
- **Supported Clients:** Claude Desktop, Claude Code, Cursor, ChatGPT, and custom autonomous agents

---

## ⚡ Powered by NVIDIA Models on Nebius Token Factory

Portable Memory employs a dual-tier model architecture on **Nebius Token Factory** that balances **serious multi-step reasoning** with **instantaneous everyday speed**, ensuring the app stays responsive while maximizing compute efficiency.

```
                     ┌─────────────────────────────────────────────────────────┐
                     │                  PORTABLE MEMORY CORE                   │
                     └────────────────────────────┬────────────────────────────┘
                                                  │
            ┌─────────────────────────────────────┼─────────────────────────────────────┐
            ▼                                     ▼                                     ▼
 ┌──────────────────────┐             ┌──────────────────────┐             ┌──────────────────────┐
 │  NVIDIA Nemotron 3   │             │  NVIDIA Nemotron 3   │             │   Qwen 3 Embedding   │
 │      Ultra 550B      │             │      Nano (30B)      │             │          8B          │
 ├──────────────────────┤             ├──────────────────────┤             ├──────────────────────┤
 │  SERIOUS REASONING   │             │    EVERYDAY SPEED    │             │   SEMANTIC VECTORS   │
 │ • Memory Dreaming    │             │ • Fast Triage        │             │ • 1536-dim (MRL)     │
 │ • Contradiction Hunt │             │ • Procedure Detect   │             │ • Hybrid RRF Search  │
 │ • Graph Synthesis    │             │ • Condition Triggers │             │ • Near-Dup Guard     │
 └──────────────────────┘             └──────────────────────┘             └──────────────────────┘
```

### 1. NVIDIA Nemotron 3 Ultra 550B (`nvidia/Nemotron-3-Ultra-550b-a55b`)
> *"Reach for Nemotron 3 Ultra when you need serious reasoning."*

- **Memory Consolidation ("Dreaming"):** Just as the human brain replays and consolidates experiences during sleep, Portable Memory runs automated background dream cycles. Nemotron 3 Ultra inspects memories across multiple folders, synthesizes disconnected notes into unified concepts, and proposes clean merges.
- **Contradiction Resolution:** When disparate agents record conflicting statements (e.g., *"Prefers Neovim with Lua plugins"* vs *"Primary editor is VS Code"*), Nemotron 3 Ultra detects the logical conflict, explains the discrepancy, and drafts a resolution proposal for human review.
- **Deep Knowledge Graph Synthesis:** Automatically extracts entities (people, projects, concepts, tools, organizations) and predicts typed multi-hop relations with confidence scores and explicit source attribution.

### 2. NVIDIA Nemotron 3 Nano (`nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`) & Super (`nvidia/nemotron-3-super-120b-a12b`)
> *"Let Nano or Super handle the fast, everyday calls, so your app stays responsive and your credits stretch further."*

- **Everyday Procedure Detection:** When memories are recorded, Nemotron Nano inspects the text in sub-second time. If the text represents an operational workflow or rule (e.g., *"When deploying to production, always ensure migrations are run first"*), Nano classifies it as **Procedural Memory** and extracts the specific activation trigger condition (`"deploying to production"`).
- **Fast Runtime Triage & Summaries:** Generates concise context briefs for agent hydration without latency spikes.
- **Nemotron Super:** Provides a high-fidelity alternative for complex fast operations requiring additional nuance.

### 3. Qwen 3 Embedding 8B (`Qwen/Qwen3-Embedding-8B`)
- **Native 1536-Dimensional Vectors:** Leverages Matryoshka Representation Learning (MRL) to output normalized 1536-dimensional embeddings natively.
- **Hybrid Retrieval:** Combined with Postgres full-text search (`tsvector`) and trigram fuzzy matching (`pg_trgm`) via Reciprocal Rank Fusion (RRF) for semantic search.
- **Near-Duplicate Detection:** Prevents memory clutter by performing real-time cosine distance checks before inserting new agent observations.

---

## 🎯 Key Features

### 1. Memory Pods & Hierarchical Folders (Namespaces)
- Create isolated **Pods** (e.g., `Personal`, `Work`, `DevOps`).
- Nested folders (up to 3 levels deep via Postgres `ltree`) with per-folder permissions:
  - `agents_can_create`: Restricts agents to updating existing keys only.
  - `require_approval`: Quarantines agent writes as drafts until approved.
  - `default_visibility`: `private` (never leaves dashboard) or `shared` (agents with folder grant).

### 2. Procedural Memory & Folder Approval Gates
- Distinguishes **Facts** (static context), **Events** (episodic timeline), and **Procedures** (operational playbooks).
- Live procedures render in agent context under `## Active Procedures` with trigger conditions (`When: <condition>`).
- Sensitive folders enforce Human-in-the-Loop review: agent writes become `draft` entries, completely invisible to other agents until approved in the dashboard.

### 3. Knowledge Graph Engine
- Entities (`person`, `project`, `tool`, `org`, `concept`) and multi-hop typed relationships (`works_on`, `prefers`, `uses`, `lives_in`, `decided`).
- **Scope-Isolated Traversal:** Agents traversing the graph via `explore_memory` only see relations whose source memories originate from folders granted to that agent.
- Interactive visual graph explorer in the dashboard at `/p/[pod]/graph`.

### 4. Native Model Context Protocol (MCP) Server
External agents connect over HTTP/SSE with bearer authentication and receive 6 native MCP tools:

| MCP Tool | Purpose |
|---|---|
| `get_context` | Hydrates pinned memories and folder index at conversation start. |
| `search_memory` | Hybrid semantic vector search powered by Qwen 3 embeddings and pgvector. |
| `get_memory` | Reads a specific entry by folder path and key. |
| `explore_memory` | Explores multi-hop relations from a seed entity in the Knowledge Graph. |
| `save_memory` | Writes or updates memory entries with optimistic concurrency (`expected_version`). |
| `forget_memory` | Performs soft-deletions (restorable for 30 days). |

### 5. OAuth 2.1 with PKCE for MCP Clients
- Implements RFC 7636 PKCE with `S256` code challenge verification.
- User authorization page at `/oauth/authorize` allowing granular approval of requested folders.
- Token exchange endpoint at `/api/oauth/token`.

### 6. Cryptographic Audit Log
- Every read, write, dream cycle, and graph exploration is logged immutably:
  - Timestamp, actor (`user` or `agent`), action, outcome (`ok` or `denied`), and latency.
  - Full traceability for user peace of mind.

---

## 🏗️ Architecture

```
 External Agents (Claude, ChatGPT, Cursor)              User Dashboard (Browser)
        │ Bearer token (pm_live_...)                            │ Session cookie (Neon Auth)
        ▼                                                       ▼
 ┌──────────────┐  ┌───────────────────┐               ┌────────────────────────┐
 │   /api/mcp   │  │  /api/v1/memory   │               │   Next.js App Router   │
 └──────┬───────┘  └─────────┬─────────┘               └───────────┬────────────┘
        │                    │                                     │
        └────────────────────┼─────────────────────────────────────┘
                             ▼
 ┌──────────────────────────────────────────────────────────────────────────────┐
 │                         PORTABLE MEMORY CORE ENGINE                          │
 │ • Scoped Authentication (Token HMAC Pepper + Neon Auth)                      │
 │ • Namespace Boundary Enforcer (Postgres ltree queries)                       │
 │ • Procedural Approval Gates (status = 'live' vs 'draft')                     │
 │ • Sanitization & Optimistic Concurrency                                      │
 └───────────────────────────┬──────────────────────────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼                                 ▼
 ┌────────────────────────┐       ┌────────────────────────┐
 │  NEBIUS TOKEN FACTORY  │       │     NEON POSTGRES      │
 │ • Nemotron 3 Ultra     │       │ • Drizzle ORM Schema   │
 │ • Nemotron 3 Nano      │       │ • pgvector embeddings  │
 │ • Qwen 3 Embedding 8B  │       │ • ltree hierarchical   │
 └────────────────────────┘       │ • Full audit event log │
                                  └────────────────────────┘
```

---

## 📦 Tech Stack

| Layer | Technology |
|---|---|
| **AI Inference** | **Nebius Token Factory** (`nvidia/Nemotron-3-Ultra-550b-a55b`, `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, `Qwen/Qwen3-Embedding-8B`) |
| **Database** | **Neon Postgres** (serverless pooled connections, `pgvector`, `ltree`, `pg_trgm`) |
| **Authentication** | **Neon Auth** (managed Better Auth with email verification & sessions) |
| **Object Storage** | **Neon Object Storage** (S3-compatible ingestion) |
| **ORM** | **Drizzle ORM** |
| **Framework** | **Next.js 16 (Turbopack)** + React 19 + TypeScript |
| **Styling** | **Tailwind CSS 4** |
| **Protocol** | **Model Context Protocol (MCP)** + OAuth 2.1 PKCE |
| **Deployment** | **Vercel** |

---

## 🛠️ Getting Started (Local Development)

### Prerequisites
- **Node.js 22+**
- **pnpm 10+** (`npm i -g pnpm`)
- A **Neon Postgres** database with Auth enabled
- A **Nebius Token Factory** API key

### 1. Clone & Install
```bash
git clone https://github.com/hackathon-1st-1337/portable-memory.git
cd portable-memory
pnpm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

Set the required environment variables:
```env
# Neon Postgres
DATABASE_URL=postgresql://user:password@ep-xyz-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require

# Neon Auth
NEON_AUTH_BASE_URL=https://ep-xyz.neonauth.us-east-2.aws.neon.tech/neondb/auth
NEON_AUTH_COOKIE_SECRET=your-32-char-random-secret

# Nebius Token Factory
NEBIUS_API_KEY=your-nebius-token-factory-api-key

# Security
TOKEN_PEPPER=random-32-byte-hex-string
```

### 3. Run Database Migrations
```bash
pnpm db:migrate
```

### 4. Run the Verification Suites
Verify all Nebius models and end-to-end v2 features against your database:
```bash
# Verify Nebius Token Factory models (Ultra, Nano, Qwen)
pnpm tsx scripts/verify-nebius.ts

# Verify v2 memory, procedures, dreaming, and knowledge graph
pnpm tsx scripts/verify-v2.ts
```

### 5. Start Development Server
```bash
pnpm dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🤖 Connecting an AI Agent via MCP

To connect **Claude Desktop**, add this configuration to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "portable-memory": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://portable-memory.vercel.app/api/mcp",
        "--header",
        "Authorization: Bearer pm_live_your_agent_token_here"
      ]
    }
  }
}
```

Once connected, your agent will immediately call `get_context` to load your preferences and active procedures, call `search_memory` for semantic recall, and use `save_memory` to store insights across sessions.

---

## 🧪 Verification & Test Results

The repository includes comprehensive automated verification suites:

```bash
$ pnpm tsx scripts/verify-nebius.ts

=================================================
   NEBIUS TOKEN FACTORY INTEGRATION VERIFICATION 
=================================================
1. Testing Qwen 3 Embedding 8B (Matryoshka 1536-dim)...
   Model reported: nebius:Qwen/Qwen3-Embedding-8B
   Vector dimensions: 1536
   ✓ Qwen embedding generated directly at native 1536 dimensions!

2. Testing Nemotron 3 Nano (Everyday fast operations)...
   Model: nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B (1138ms)
   ✓ Nemotron Nano fast everyday call succeeded!

3. Testing Fast Procedure Detection (Nemotron Nano)...
   Detected Procedure: true
   Trigger Condition: deploying to production
   ✓ Automatic procedure classification succeeded!

4. Testing Nemotron 3 Ultra 550B (Serious Reasoning)...
   Model: nvidia/Nemotron-3-Ultra-550b-a55b (1527ms)
   ✓ Nemotron 3 Ultra serious reasoning succeeded!

=================================================
   ✨ ALL NEBIUS TOKEN FACTORY CHECKS PASSED!     
=================================================
```

---

## 📄 License

MIT © 2026 Portable Memory Authors.
