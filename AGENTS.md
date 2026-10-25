<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

# Portable Memory — Project Specification

## Problem Statement

AI assistants are stateless by default. Every time a user opens a new conversation with Claude, ChatGPT, a custom agent, or any other AI, that agent starts from zero — no knowledge of the user's preferences, past decisions, ongoing projects, or personal context. This forces users to re-explain themselves constantly and prevents AI agents from becoming genuinely useful long-term companions.

**Portable Memory** solves this by giving users a single, sovereign memory store that travels with them across any AI agent or platform.

---

## Vision

> *"One memory. Every AI. Your rules."*

A user creates one **Memory Pod** — a structured, versioned store of personal context. They can plug this pod into any supported AI agent (Claude, ChatGPT, a custom bot, etc.) and that agent immediately gains awareness of who the user is, what they care about, and what they've shared.

The user stays in full control: they decide which agents can read, which can write, and which have access to which memory namespaces. Memory is not locked to any one platform.

---

## Core Concepts

### Memory Pod
The central unit. A user's personal memory store. Contains namespaced memory entries, access tokens, and audit logs. Hosted by the user (self-hosted or via this platform).

### Memory Entry
A single piece of stored context. Examples:
- `preferences.tone` → "formal, concise"
- `projects.active` → ["Portable Memory", "garden redesign"]
- `identity.name` → "Alex"
- `health.dietary` → "vegetarian"

Each entry has:
- `namespace` — logical grouping (e.g. `preferences`, `projects`, `identity`)
- `key` — unique name within the namespace
- `value` — the stored data (string, JSON object, or array)
- `visibility` — `private | shared | public`
- `created_at`, `updated_at`, `version`

### Agent Connection
An authorized link between a Memory Pod and an external AI agent or platform. Each connection has:
- A unique API token scoped to that agent
- A permission set (see Access Control below)
- An optional namespace whitelist (which namespaces the agent can see)
- Rate limits and expiry

### Access Control
Fine-grained, per-agent permissions:

| Permission | Description |
|---|---|
| `memory:read` | Read allowed namespaces |
| `memory:write` | Create/update entries in allowed namespaces |
| `memory:delete` | Delete entries |
| `memory:list` | List keys without reading values |
| `audit:read` | View own access logs |

Agents never have access to entries outside their whitelisted namespaces, regardless of permissions granted.

---

## User Flows

### 1. Setup
1. User creates an account and a **Memory Pod**
2. User populates initial memory entries (name, preferences, projects, etc.)
3. User reviews the default namespace structure

### 2. Connecting an Agent
1. User goes to **Connections** → **Add Agent**
2. Names the connection (e.g. "Claude – work assistant")
3. Selects allowed namespaces (e.g. `preferences`, `projects`)
4. Selects permissions (e.g. `memory:read`, `memory:write`)
5. Copies the generated API token / MCP endpoint URL
6. Pastes it into the agent's configuration (Claude project settings, GPT instructions, custom system prompt, etc.)

### 3. Agent Usage
- On each conversation start, the agent calls the Memory API to hydrate context
- During the conversation, the agent may write new insights back (if `memory:write` is granted)
- The user can review all reads/writes in the **Audit Log**

### 4. Revoking / Managing Access
- User can pause, revoke, or edit any connection at any time from the **Connections** dashboard
- Revoking a token immediately blocks further API access

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  User Dashboard                  │
│  (Next.js App — this repo)                      │
│  • Memory editor  • Connections  • Audit log    │
└────────────────────┬────────────────────────────┘
                     │ HTTPS / REST + MCP
          ┌──────────▼──────────┐
          │   Memory API        │
          │  (Next.js API Routes│
          │   or separate svc)  │
          └──────────┬──────────┘
                     │
          ┌──────────▼──────────┐
          │   Memory Store      │
          │  (PostgreSQL /      │
          │   SQLite for dev)   │
          └─────────────────────┘

External Agents (Claude, ChatGPT, custom bots)
  → authenticate with scoped token
  → call Memory API endpoints
  → read/write allowed namespaces only
```

### API Endpoints (planned)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/memory` | List all entries (filtered by agent permissions) |
| `GET` | `/api/memory/:namespace/:key` | Read a specific entry |
| `PUT` | `/api/memory/:namespace/:key` | Write/update an entry |
| `DELETE` | `/api/memory/:namespace/:key` | Delete an entry |
| `GET` | `/api/memory/:namespace` | List all keys in a namespace |
| `GET` | `/api/connections` | List agent connections |
| `POST` | `/api/connections` | Create a new agent connection |
| `DELETE` | `/api/connections/:id` | Revoke a connection |
| `GET` | `/api/audit` | Read audit log |

### MCP (Model Context Protocol) Support
Expose a compliant MCP server endpoint so agents that support MCP natively (e.g. Claude Desktop) can connect without manual API integration.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| AI Integration | Vercel AI SDK (`ai`) |
| Auth | **Neon Auth** |
| Database | **Neon Postgres** |
| File Storage | **Neon Object Storage** |
| Realtime | **Neon Realtime** |
| ORM | Drizzle ORM |
| API | Next.js API Routes |
| MCP Server | Custom MCP-compliant endpoint |

---

## 🤖 Available Agent Skills

The following skills are installed in `.agents/skills/` and MUST be read and followed before working on their respective areas.

| Skill | Path | When to use |
|---|---|---|
| `neon` | `.agents/skills/neon/SKILL.md` | Any Neon service — Postgres, Auth, Object Storage, Realtime, CLI |
| `web-design-guidelines` | `.agents/skills/web-design-guidelines/SKILL.md` | Before building or reviewing any UI component or page |
| `find-skills` | `.agents/skills/find-skills/SKILL.md` | When you need a skill for a framework/task not listed here |

> **Rule:** Always read the relevant skill's `SKILL.md` before writing code in its domain. Skills take precedence over training-data assumptions.

---

## Development Guidelines

- **Read `node_modules/next/dist/docs/`** before using any Next.js API — this version may differ from training data.
- All API routes must validate the agent's token and enforce namespace scoping before touching the database.
- Memory values must be sanitized before storage and before being returned to agents.
- Never expose one user's data to another user's agent token under any circumstance.
- Audit every read and write with: `agent_id`, `action`, `namespace`, `key`, `timestamp`.
- Keep agent-facing API responses minimal — only return what the agent asked for.
- The user dashboard should feel like a **control panel** — the user is the administrator of their own memory.
- **UI work** → read `.agents/skills/web-design-guidelines/SKILL.md` before building or reviewing any component.
- **Neon work** → read `.agents/skills/neon/SKILL.md` before touching any database, auth, storage, or realtime code.

### 🔍 Unknown Framework Versions & Complex Tasks

> **If you are not confident about the version of any framework or library used in this project, or if you are facing a complex/unfamiliar task — do NOT guess based on training data.**

First check the **Available Agent Skills** table above — `neon` and `web-design-guidelines` are already installed. If no existing skill covers your task, use the **`find-skills`** skill to locate and install one.

**Trigger this rule when:**
- A framework version differs from what you were trained on (e.g. a new major version of Next.js, Drizzle ORM, Tailwind, etc.)
- You are unsure which API, config format, or convention applies to the installed version
- You encounter a complex integration task (e.g. MCP server setup, Drizzle migrations, NextAuth config) and are not fully certain of the current patterns

**How to use `find-skills`:**
1. Read the skill instructions at `.agents/skills/find-skills/SKILL.md`
2. Follow its instructions to search for and install a skill relevant to your task
3. Read and follow that skill before proceeding with implementation

This prevents subtle bugs caused by stale API knowledge and ensures code matches the actual installed versions in this repo.

---

## 🛠️ Neon Infrastructure Setup

This project runs entirely on [Neon](https://neon.tech). All services — Postgres, Auth, Object Storage, and Realtime — are provisioned via the Neon CLI.

> **Every agent that bootstraps or re-provisions this project MUST follow these steps in order.**

### Step 1 — Install the Neon CLI

```bash
npm i -g neon@latest
```

If that fails, prefix every `neon` command below with `npx neon@latest` instead.
If any command opens a browser sign-in, tell the user to complete it there.
If the browser flow times out or fails, ask the user to run `neon login`, then retry.

### Step 2 — Initialise the project

From the project root:

```bash
neon init -y \
  --org-id org-broad-voice-61222754 \
  --project-id raspy-dawn-35051979 \
  --branch production \
  --services postgres,auth,object-storage,realtime
```

This generates `neon.ts` (service configuration) in the project root.

### Step 3 — Deploy & pull env vars

```bash
neon deploy
```

This provisions the declared services on Neon and writes all required environment variables into `.env.local` (or `.env` if it already exists).

### Step 4 — Wire services into the app

Env vars are already provisioned in `.env`. Use them as follows:

| Service | Env Var(s) | Usage |
|---|---|---|
| **Postgres** | `DATABASE_URL` | Drizzle ORM connection string (pooled, SSL required) |
| **Auth** | `NEON_AUTH_URL`, `NEON_JWKS_URL` | Neon Auth SDK — JWT verification endpoint |
| **Object Storage** | `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | S3-compatible client (e.g. `@aws-sdk/client-s3`) |
| **Realtime** | _(not yet in .env — provision via `neon deploy` if missing)_ | Neon Realtime channel subscriptions |

> ⚠️ Never hardcode values from `.env` in source code. Always read them via `process.env.*` at runtime.

Consult the **`neon` skill** at `.agents/skills/neon/SKILL.md` for best practices and driver recommendations given the app's runtime.


### Step 5 — Verify end-to-end

```bash
npm run build   # must pass with 0 errors
npm run dev     # start the app, then manually test each wired service
```

Each service must be tested end-to-end before marking setup as complete. Report:
- What changed in the codebase
- The `npm run build` output proving it passed
- Any failures or skipped services with reasons

---

## Out of Scope (v1)

- End-to-end encryption at rest (planned for v2)
- Memory sharing between users
- Mobile app
- Billing / tiered plans

