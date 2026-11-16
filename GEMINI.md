# MundusMK Tender Ops — Workspace Rules

## Stack & Runtime
- **Language:** 100% TypeScript (strict mode). Never generate Rust, Tauri (`@tauri-apps/*`), or Python files.
- **Package Manager & Worker Runtime:** Bun (`bun install`, `bun run`).
- **Framework:** Next.js 15 App Router (`app/`), React 19, Tailwind CSS v4, `framer-motion`, `lucide-react`.
- **Database & Storage:** Convex (`convex/react`, `convex/server`) with `vectorIndex` on `tenderChunks` for tender PDF RAG Q&A and Convex File Storage (`storageId`) for client compliance docs.
- **AI Routing:** OpenRouter via `@openrouter/ai-sdk-provider` using per-client sub-keys (`$15/mo` cap). Route DOM/chat tasks to `deepseek/deepseek-v4-flash` and full tender PDF audits to `anthropic/claude-sonnet-5.5`.
- **Browser & Sandbox:** `@browserbasehq/stagehand` + `playwright-core` running locally in dev (`HEADLESS=false`) and inside `@boatdev/sdk` Ubuntu VMs in production.
- **PDF Manipulation:** `unpdf` for text extraction; `pdf-lib` for deterministic SBD 1/4/6.1 stamping and PDF merging.

## Core Product Guardrails
1. **Approval Shield (Mandatory):** Any action that submits a tender on `eTenders.gov.za`, sends an external email, or triggers a WhatsApp broadcast MUST pause and write a `pending_approval` record to Convex (`pendingApprovals`). Execution only resumes after an authenticated user approves via `/bid/[id]`.
2. **Compliance Expiry Rules:** Flag CSD reports older than 7 days, certified CIPC/ID copies older than 90 days, and expired Tax PIN / COIDA / B-BBEE certificates before staging any bid.
3. **UI Aesthetic:** Preserve the existing dark obsidian palette from `src/index.css` (`#09090B` background, `#121215` elevated cards, `1px` `border-white/10` hairline borders, `tabular-nums` on all Rand figures).
