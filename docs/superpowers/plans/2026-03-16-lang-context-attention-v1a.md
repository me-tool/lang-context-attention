# Lang Context Attention v1a Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement v1a MVP of the topic-aware context routing system — core engine SDK + default providers + demo app.

**Architecture:** Monorepo with 3 packages (`core`, `store-sqlite`, `provider-ai-sdk`) and 1 demo app (`apps/demo`). Core defines interfaces, router, context assembly, and engine. Packages implement pluggable providers. Demo app provides full UI.

**Tech Stack:** TypeScript, pnpm workspaces, Turborepo, vitest, Next.js (App Router), Ant Design + @ant-design/x, Zustand, SQLite (better-sqlite3 + sqlite-vec), Vercel AI SDK, nanoid, zod

---

## Phase 1: Monorepo Scaffolding + Core Types

### Task 1: Monorepo Setup
**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`
- Create: `packages/store-sqlite/package.json`, `packages/store-sqlite/tsconfig.json`
- Create: `packages/provider-ai-sdk/package.json`, `packages/provider-ai-sdk/tsconfig.json`

### Task 2: Core Types & Interfaces
**Files:**
- Create: `packages/core/src/types.ts` — all data models
- Create: `packages/core/src/interfaces.ts` — all provider interfaces
- Create: `packages/core/src/index.ts` — public exports

## Phase 2: Core Engine Logic (parallel with Phase 3 & 4)

### Task 3: Router (hybrid retrieval + RRF)
**Files:**
- Create: `packages/core/src/router.ts`
- Test: `packages/core/src/__tests__/router.test.ts`

### Task 4: Context Assembly
**Files:**
- Create: `packages/core/src/context.ts`
- Test: `packages/core/src/__tests__/context.test.ts`

### Task 5: Engine
**Files:**
- Create: `packages/core/src/engine.ts`
- Test: `packages/core/src/__tests__/engine.test.ts`

## Phase 3: store-sqlite (parallel)

### Task 6: SQLite Store + Search Providers
**Files:**
- Create: `packages/store-sqlite/src/db.ts` — database init + migrations
- Create: `packages/store-sqlite/src/sqlite-store.ts`
- Create: `packages/store-sqlite/src/sqlite-vector.ts`
- Create: `packages/store-sqlite/src/sqlite-keyword.ts`
- Create: `packages/store-sqlite/src/index.ts`
- Test: `packages/store-sqlite/src/__tests__/sqlite-store.test.ts`
- Test: `packages/store-sqlite/src/__tests__/sqlite-search.test.ts`

## Phase 4: provider-ai-sdk (parallel)

### Task 7: AI SDK Providers
**Files:**
- Create: `packages/provider-ai-sdk/src/chat-provider.ts`
- Create: `packages/provider-ai-sdk/src/judge-provider.ts`
- Create: `packages/provider-ai-sdk/src/embedding-provider.ts`
- Create: `packages/provider-ai-sdk/src/index.ts`
- Test: `packages/provider-ai-sdk/src/__tests__/judge-provider.test.ts`

## Phase 5: Demo App

### Task 8: Next.js App Setup + API Routes
**Files:**
- Create: `apps/demo/package.json`, `apps/demo/tsconfig.json`, `apps/demo/next.config.ts`
- Create: `apps/demo/app/layout.tsx`, `apps/demo/app/page.tsx`
- Create: `apps/demo/app/api/sessions/route.ts`
- Create: `apps/demo/app/api/messages/route.ts`
- Create: `apps/demo/lib/engine.ts` — singleton engine instance

### Task 9: Zustand Stores
**Files:**
- Create: `apps/demo/stores/session.ts`
- Create: `apps/demo/stores/ui.ts`
- Create: `apps/demo/stores/debug.ts`

### Task 10: Chat UI Component
**Files:**
- Create: `apps/demo/components/chat/ChatArea.tsx`
- Create: `apps/demo/components/chat/MessageBubble.tsx`
- Create: `apps/demo/components/chat/ChatInput.tsx`

### Task 11: Tree Sidebar Component
**Files:**
- Create: `apps/demo/components/tree/TreeSidebar.tsx`
- Create: `apps/demo/components/tree/RootQuestionItem.tsx`

### Task 12: Debug Panel Component
**Files:**
- Create: `apps/demo/components/debug/DebugPanel.tsx`
- Create: `apps/demo/components/debug/RoutingDetails.tsx`

### Task 13: Link Banner + Layout Assembly
**Files:**
- Create: `apps/demo/components/LinkBanner.tsx`
- Modify: `apps/demo/app/page.tsx` — assemble all components

## Phase 6: Integration & Review
### Task 14: End-to-end integration test + final review
