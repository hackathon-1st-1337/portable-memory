# Portable Memory

> **One memory. Every AI. Your rules.**

AI assistants forget you. Every new chat with Claude, ChatGPT, or a custom agent starts from zero, so you keep re-explaining your preferences, your projects, and the decisions you've already made.

**Portable Memory** gives you a single memory that you own and can plug into any AI agent. Agents read what you allow them to read, write back what they learn when you allow them to, and every access is recorded in an audit log you control.

> 🚧 **Status:** early development (hackathon project). User authentication works today. The memory store, agent access, REST API and MCP server are being built; see [Roadmap](#roadmap) and [PLAN.md](PLAN.md).

---

## Table of contents

- [How it works](#how-it-works)
- [What works today](#what-works-today)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Project structure](#project-structure)
- [Implementation notes](#implementation-notes)
- [Roadmap](#roadmap)
- [Contributing](#contributing)

---

## How it works

### Core concepts

| Concept | What it is |
|---|---|
| **Pod** | One isolated memory, e.g. "Personal" or "Work". A user can have several pods, and nothing crosses between them. |
| **Namespace** | A folder inside a pod (`preferences`, `projects/portable-memory`). Folders can nest up to 3 levels. **Access is granted per folder.** |
| **Memory entry** | One piece of context: `namespace + key → value`, e.g. `preferences.tone → "Formal, concise"`. Entries can be **pinned** (always loaded) or **private** (never sent to any agent). |
| **Agent** | An AI you connect (Claude, ChatGPT, a bot), with a name, permissions (`memory:read`, `memory:write`, …) and the folders it may open. |
| **Token** | The agent's credential (`pm_live_…`). Shown once and stored hashed. Revoking it blocks access on the very next request. |

### Example

```
📦 Pod "Personal"
├── 📁 identity        name, location, languages            📌 pinned
├── 📁 preferences     tone, formatting, code-style
├── 📁 projects
│   ├── 📁 portable-memory   goal, stack
│   └── 📁 garden            plan, budget
├── 📁 health          dietary, allergies 🔒 private
└── 📁 notes           things agents learned over time

🤖 Claude – work      can read + write   projects/portable-memory, preferences
🤖 ChatGPT – personal can read           identity, preferences, health
```

Claude sees the Portable Memory project but not the garden project. ChatGPT sees your dietary preference but never the private allergy entry. Both read the **same** `preferences`, so you update a preference once and every agent gets it.

### The access rule

An agent can see an entry only if **all** of these hold:

1. the entry is in the agent's pod,
2. the entry's folder is one of the agent's granted folders, or inside one,
3. the entry is not `private`,
4. the entry has not been deleted.

This is enforced in the database query itself, not after the data has been loaded.

### Agent tools (planned, over MCP)

Agents that speak the [Model Context Protocol](https://modelcontextprotocol.io) (Claude Desktop, Claude Code, Cursor, and others) connect with a URL and a token, and get five tools:

| Tool | Purpose |
|---|---|
| `get_context` | Load pinned memory at the start of a conversation, plus an index of everything else |
| `search_memory` | Find relevant memories by keyword, and later by meaning |
| `get_memory` | Read one exact entry |
| `save_memory` | Remember something new or update an entry (with duplicate and conflict checks) |
| `forget_memory` | Delete an entry (soft delete, so it can be restored) |

Agents manage memory **content**. Structure and access (folders, pins, privacy, permissions) are managed only by you, in the dashboard.

---

## What works today

- ✅ **Sign up and sign in** with email and password, or with Google
- ✅ **Email verification** and **password reset** with one-time codes
- ✅ **Protected dashboard** that redirects signed-out visitors and returns them to the page they asked for afterwards; external `?next=` redirects are refused
- ✅ **Account settings:** change name, change password (signs out other devices), list active devices and sign them out
- 🔜 Memory pods, folders and entries
- 🔜 Agents, tokens and the audit log
- 🔜 REST API and MCP server
- 🔜 Semantic search

The auth flows are covered by an end-to-end browser test suite run against a live Neon Auth project.

---

## Architecture

```
 Claude / ChatGPT / Cursor           Custom bots & scripts           You (browser)
          │ MCP + bearer token               │ REST + bearer token         │ session cookie
          ▼                                  ▼                             ▼
     /api/mcp                         /api/v1/memory/…                Dashboard (Next.js)
          └──────────────────┬───────────────┘                             │
                             ▼                                             │
          Memory core: authenticate → check permissions → filter by folders │
                       → sanitize → query → write audit event  ◀───────────┘
                             ▼
                Neon Postgres (Drizzle ORM)
```

The REST API and the MCP server are thin layers over **one shared core**, so both enforce exactly the same rules. Humans and agents are separate identities: people sign in with Neon Auth, and agents authenticate with their own scoped tokens.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Cache Components) + React 19 + TypeScript |
| Styling | Tailwind CSS 4 |
| Auth | [Neon Auth](https://neon.com/docs/auth/overview) (managed Better Auth) via `@neondatabase/auth` |
| Database | [Neon Postgres](https://neon.com) with Drizzle ORM (`ltree` for folders, `pgvector` for semantic search) |
| AI | [Vercel AI SDK](https://ai-sdk.dev) |
| Agent protocol | [Model Context Protocol](https://modelcontextprotocol.io) |
| Package manager | pnpm |

---

## Getting started

### Prerequisites

- **Node.js 22+**
- **pnpm 11+** (`npm i -g pnpm`)
- A **[Neon](https://neon.com) project** with **Auth enabled**, in an AWS region (Neon Auth runs only on AWS)

### 1. Install

```bash
git clone git@github.com:hackathon-1st-1337/portable-memory.git
cd portable-memory
pnpm install
```

### 2. Configure

```bash
cp .env.example .env
```

Fill in at least:

- `NEON_AUTH_BASE_URL`: in the Neon Console under **Auth → Configuration**. It ends in `/neondb/auth`.
- `NEON_AUTH_COOKIE_SECRET`: generate one with `openssl rand -base64 32`.

With the [Neon CLI](https://neon.com/docs/cli/install), `neon deploy` provisions the project's services and writes their variables into `.env` for you. You still need to add `NEON_AUTH_BASE_URL` and the cookie secret yourself.

### 3. Run

```bash
pnpm dev     # http://localhost:3000
```

Other scripts:

```bash
pnpm build   # production build
pnpm start   # serve the production build
pnpm lint    # ESLint
```

`localhost` is a trusted domain in Neon Auth by default, so sign-in works locally without extra setup.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `NEON_AUTH_BASE_URL` | ✅ | Your branch's Neon Auth URL (includes the `/neondb/auth` path) |
| `NEON_AUTH_COOKIE_SECRET` | ✅ | Signs the session cache cookie. At least 32 characters. |
| `DATABASE_URL` | soon | Pooled Neon Postgres connection string, used by the memory store |
| `NEON_AUTH_URL`, `NEON_JWKS_URL` | — | Written by `neon deploy`; not read by the app yet |
| `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` | — | Neon Object Storage, planned for file import |

Never commit `.env`; it's ignored by git. Only `.env.example` is tracked.

---

## Project structure

```
src/
├── proxy.ts                     # Route protection (Next.js 16 "proxy", formerly middleware)
├── app/
│   ├── page.tsx                 # Landing page (fully static)
│   ├── auth/                    # Sign in, sign up, verify email, forgot/reset password
│   ├── (app)/                   # Signed-in area: shared header + layout
│   │   ├── dashboard/
│   │   └── account/             # Profile, password, active sessions
│   └── api/
│       ├── auth/[...path]/      # Proxy to Neon Auth (used by the browser client)
│       ├── account/sessions/    # Lists the user's sessions (tokens never sent to the browser)
│       └── me/                  # Example of a protected API route
├── components/                  # Logo, form fields, buttons, alerts
└── lib/auth/
    ├── server.ts                # Neon Auth server instance
    ├── client.ts                # Neon Auth browser client
    ├── session.ts               # getCurrentUser / requireUser / requireApiUser
    ├── account.ts               # Session listing & revocation helpers
    ├── errors.ts                # Maps SDK errors to user-facing messages
    └── paths.ts                 # Shared auth routes

PLAN.md                          # Full v1/v2 plan with the database schema
AGENTS.md                        # Project spec and rules for AI coding agents
.agents/skills/                  # Agent skills (Neon, web design guidelines, find-skills)
```

---

## Implementation notes

Things worth knowing before you change the auth code:

- **Cache Components is on.** Anything that reads the session must render inside `<Suspense>`. Don't use `export const dynamic = 'force-dynamic'`.
- **Don't call Neon Auth server methods that reach the Neon Auth service while a Server Component is rendering.** The SDK may try to set cookies during the call, which Next.js forbids during render. `getSession()` is safe on routes covered by `proxy.ts`, because the proxy keeps the session cookie fresh. Anything else (listing sessions, for example) belongs in a Route Handler or a Server Action.
- **Sign-in, sign-up and email verification run through the browser client**, so Neon Auth records the user's real browser and each session in the device list shows the right name.
- **Password reset uses the browser client.** The server SDK's `emailOtp.resetPassword` calls an endpoint Neon Auth doesn't serve.
- **Session cache is 60 seconds** (`sessionDataTtl`), so a revoked session loses access within a minute.
- **Every Server Action and Route Handler re-checks the session.** The redirects in `proxy.ts` are a convenience, not an authorization check.

### Before going to production

- [ ] Configure **custom SMTP** in Neon Auth (the shared sender is for development only)
- [ ] Create your own **Google OAuth app** (the shared credentials are for development only)
- [ ] Add your production domain to Neon Auth's **trusted domains**
- [ ] Set `NEON_AUTH_BASE_URL` and `NEON_AUTH_COOKIE_SECRET` on your hosting platform

---

## Roadmap

The full plan, including the database schema, is in **[PLAN.md](PLAN.md)**.

**v1: the core loop**
- [x] User authentication (Neon Auth)
- [ ] Database foundations (Drizzle, migrations)
- [ ] Pods: create several isolated memories
- [ ] Namespaces: nested folders, per-folder settings
- [ ] Memory entries: pin, privacy, version history
- [ ] Agents & tokens: scoped permissions, instant revocation
- [ ] REST API
- [ ] Audit log
- [ ] MCP server
- [ ] Semantic search & duplicate detection (pgvector)

**v2: smarter memory**
- [ ] Procedural memory: agents propose "how you like things done", and you approve
- [ ] Dreaming: background consolidation that suggests merges and flags contradictions and stale entries
- [ ] Knowledge graph: people, projects and tools, linked to the memories they come from
- [ ] OAuth for MCP: add Portable Memory to claude.ai or ChatGPT by pasting a URL
- [ ] Encryption at rest, file import, live dashboard updates

---

## Contributing

1. Branch from `dev-v1`.
2. Read [AGENTS.md](AGENTS.md) for the project rules. If you work with an AI coding agent, it should read the skills in `.agents/skills/` first.
3. Before opening a PR, make sure `pnpm lint` and `pnpm build` both pass.

**Security rules that apply to every change:** agents never see anything outside their granted folders, one user's data is never reachable through another user's agent, and every agent read or write is audited.
