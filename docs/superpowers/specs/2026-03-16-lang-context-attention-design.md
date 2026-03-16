# Lang Context Attention - Design Spec

## Problem

In LLM-based conversation applications, users frequently ask random, unrelated questions within a single session. Traditional approaches either include the entire conversation history (wasting tokens and diluting model attention) or truncate older messages (losing important context). Neither approach optimally serves the user.

## Solution

A topic-aware context routing system that automatically clusters user messages by topic ("root questions"), and assembles only relevant context for each LLM request. This ensures the model's attention stays focused on what matters for the current question.

## Architecture Overview

```
User Message
    |
    v
[EmbeddingProvider.embed(userMessage)]
    |
    v
[Hybrid Retrieval — parallel]
    |-- VectorSearchProvider.search(embedding, topK)
    |-- KeywordSearchProvider.search(userMessage, topK)
    |-- Score Fusion via RRF
    v
[JudgeProvider.judge(candidates + userMessage)]
    |  - Classify: existing root question / new root question
    |  - Detect: potential cross-topic links
    v
[Context Assembly]
    |  - system prompt
    |  - target root question's message history
    |  - linked questions' messages (if any)
    |  - current user message
    v
[ChatProvider.streamChat(assembledContext)]
    |
    v
[Store response + Index update]
```

## Project Structure (Monorepo)

```
llm-context-attention/
├── packages/
│   ├── core/                    # Routing engine SDK
│   │   ├── src/
│   │   │   ├── engine.ts        # Main engine class (public API)
│   │   │   ├── router.ts        # Hybrid retrieval + score fusion (receives embedding + text, calls search providers, returns candidates)
│   │   │   ├── context.ts       # Context assembly with token budget
│   │   │   ├── interfaces.ts    # Provider interfaces (see below)
│   │   │   └── types.ts         # Data models
│   │   └── package.json
│   ├── store-sqlite/            # Default storage implementation
│   │   ├── src/
│   │   │   ├── sqlite-vector.ts # sqlite-vec vector search
│   │   │   ├── sqlite-keyword.ts # FTS5 keyword search
│   │   │   └── sqlite-store.ts  # Session/RootQuestion/Message/RoutingDecision persistence
│   │   └── package.json
│   └── provider-ai-sdk/         # Default LLM provider (Vercel AI SDK + Gateway)
│       ├── src/
│       │   ├── chat-provider.ts
│       │   ├── judge-provider.ts  # Configurable prompt template via constructor
│       │   └── embedding-provider.ts
│       └── package.json
├── apps/
│   └── demo/                    # Next.js Demo Application
│       ├── app/
│       │   ├── page.tsx         # Main conversation page
│       │   └── api/             # API routes
│       ├── components/
│       │   ├── chat/            # Conversation area (streaming support)
│       │   ├── tree/            # Conversation tree sidebar (collapsible)
│       │   ├── debug/           # Debug panel (collapsible)
│       │   └── command/         # Quick panel (Cmd+K)
│       ├── stores/
│       │   ├── session.ts       # Session & root question state
│       │   ├── ui.ts            # Panel visibility, selected message, etc.
│       │   └── debug.ts         # Debug panel state
│       └── package.json
├── docs/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Engine Public API

```typescript
import { nanoid } from 'nanoid'  // IDs generated via nanoid (short, URL-safe)

// Factory function
function createEngine(config: EngineConfig): Engine

// Engine class
class Engine {
  // Create a new conversation session
  createSession(systemPrompt: string, title?: string): Promise<Session>

  // Core method: process a user message and return a streaming response
  // Handles the full routing flow: embed → retrieve → judge → assemble → stream
  processMessage(sessionId: string, userMessage: string): Promise<{
    stream: AsyncIterable<string>       // Streaming LLM response
    routingDecision: RoutingDecision    // Routing metadata (available immediately after judgment, before stream completes)
    rootQuestionId: string              // Which root question this message was assigned to
  }>

  // Manual operations (for UI interactions)
  reassignMessage(messageId: string, newRootQuestionId: string): Promise<void>
  linkQuestions(sourceId: string, targetId: string): Promise<QuestionLink>
  unlinkQuestions(linkId: string): Promise<void>

  // Query methods (for UI rendering)
  getSession(sessionId: string): Promise<Session | null>
  getRootQuestions(sessionId: string): Promise<RootQuestion[]>
  getMessages(rootQuestionId: string): Promise<Message[]>
  getTimeline(sessionId: string): Promise<Message[]>  // All messages, chronological
  getRoutingDecision(messageId: string): Promise<RoutingDecision | null>
}
```

## Data Models

```typescript
// IDs: nanoid (21 chars, URL-safe, no ordering requirement — use createdAt for sorting)

// --- Entities (flat relational, no nested arrays) ---

interface Session {
  id: string
  title: string
  systemPrompt: string
  createdAt: Date
  updatedAt: Date
}

interface RootQuestion {
  id: string
  sessionId: string            // FK → Session
  summary: string              // LLM-generated topic summary, updated periodically
  messageCount: number         // Tracks messages for summary update interval
  createdAt: Date
  updatedAt: Date
}

interface Message {
  id: string
  sessionId: string            // FK → Session (denormalized for timeline queries)
  rootQuestionId: string       // FK → RootQuestion
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

// Independent link entity
// Single record = bidirectional relationship.
// getLinksByRootQuestion queries WHERE sourceId = id OR targetId = id.
interface QuestionLink {
  id: string
  sourceId: string             // FK → RootQuestion
  targetId: string             // FK → RootQuestion
  createdBy: 'user' | 'system'
  createdAt: Date
}

// --- Routing Decision (independent entity for debug queries) ---
// Stored in `routing_decisions` table with `candidates`, `llmJudgment`,
// `assembledContext`, and `timing` as JSON columns.

interface RoutingDecision {
  id: string
  messageId: string            // FK → Message (the user message that triggered routing)
  candidates: RoutingCandidate[]          // JSON column
  llmJudgment: JudgeResult               // JSON column
  finalTarget: string          // Final root question ID
  suggestedLinks: string[]     // Suggested links (for user prompt)
  assembledContext: {                     // JSON column
    messageIds: string[]       // Messages included in final context
    estimatedTokens: number    // Token count estimate (chars / 4 approximation)
  }
  timing: {                              // JSON column
    retrievalMs: number
    judgmentMs: number
    totalMs: number
  }
  createdAt: Date
}

interface RoutingCandidate {
  rootQuestionId: string
  vectorScore: number          // Raw score from vector search (cosine similarity, 0~1)
  bm25Score: number            // Raw score from BM25 search (unbounded)
  fusedScore: number           // RRF fusion score (see formula below)
}

// --- Provider I/O Types ---

interface SearchResult {
  id: string                   // RootQuestion ID
  score: number                // Raw score from the search provider
  summary: string              // The text that was indexed (from upsert's `text` param)
}

interface JudgeContext {
  userMessage: string
  candidates: { id: string; summary: string; fusedScore: number }[]
}

interface JudgeResult {
  targetId: string | null      // null = create new root question
  reasoning: string
  isNew: boolean
  suggestedLinks: string[]     // IDs of potentially related root questions
}

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
```

## Pluggable Interfaces

```typescript
// --- Search (split by retrieval type) ---
// Both use upsert semantics: calling upsert with an existing rootQuestionId
// overwrites the previous entry (idempotent by rootQuestionId).

interface VectorSearchProvider {
  upsert(rootQuestionId: string, text: string, embedding: number[]): Promise<void>
  search(embedding: number[], topK: number): Promise<SearchResult[]>
  delete(rootQuestionId: string): Promise<void>
}

interface KeywordSearchProvider {
  upsert(rootQuestionId: string, text: string): Promise<void>
  search(query: string, topK: number): Promise<SearchResult[]>
  delete(rootQuestionId: string): Promise<void>
}

// --- LLM (split by capability) ---

interface ChatProvider {
  chat(messages: ChatMessage[]): Promise<string>
  streamChat(messages: ChatMessage[]): AsyncIterable<string>
}

// Default JudgeProvider accepts prompt template via constructor for easy customization.
// To fully replace judgment logic, implement the JudgeProvider interface.
interface JudgeProvider {
  judge(context: JudgeContext): Promise<JudgeResult>
}

interface EmbeddingProvider {
  embed(text: string): Promise<number[]>
  readonly dimensions: number   // Embedding vector dimensions (e.g. 1536 for text-embedding-3-small)
}

// --- Storage ---

interface StoreProvider {
  // Session
  createSession(session: Session): Promise<void>
  getSession(id: string): Promise<Session | null>
  updateSession(id: string, updates: Partial<Session>): Promise<void>

  // RootQuestion
  createRootQuestion(rootQuestion: RootQuestion): Promise<void>
  getRootQuestion(id: string): Promise<RootQuestion | null>
  getRootQuestionsBySession(sessionId: string): Promise<RootQuestion[]>
  updateRootQuestion(id: string, updates: Partial<RootQuestion>): Promise<void>

  // Message
  createMessage(message: Message): Promise<void>
  getMessagesByRootQuestion(rootQuestionId: string): Promise<Message[]>
  getMessagesBySession(sessionId: string): Promise<Message[]>
  reassignMessage(messageId: string, newRootQuestionId: string): Promise<void>

  // RoutingDecision
  createRoutingDecision(decision: RoutingDecision): Promise<void>
  getRoutingDecisionByMessage(messageId: string): Promise<RoutingDecision | null>

  // QuestionLink
  createLink(link: QuestionLink): Promise<void>
  getLinksByRootQuestion(rootQuestionId: string): Promise<QuestionLink[]>  // WHERE sourceId=id OR targetId=id
  deleteLink(id: string): Promise<void>
}
```

## Score Fusion: RRF (Reciprocal Rank Fusion)

Given two ranked lists from vector search and keyword search:

```
fusedScore(d) = 1 / (rrfK + rank_vector(d)) + 1 / (rrfK + rank_keyword(d))
```

- `rank` starts at 1 (best match = rank 1)
- `rrfK` defaults to 60 (standard value from the original RRF paper)
- If a document appears in only one list, the missing rank is treated as `topK + 1`
- With rrfK=60 and topK=5, score range: min ≈ 0.030 (one list rank 5, missing list rank 6), max ≈ 0.033 (both lists rank 1)

**Threshold note:** `minFusedScoreForJudge` must be calibrated to the RRF score range. Default: **0.01** (below the minimum possible score when a document appears in at least one list, meaning: if any candidate is found, always consult the Judge). Set higher to skip Judge calls for weak matches.

## Routing Flow

### Cold Start (first message in session)

1. No RootQuestions exist → skip retrieval and judgment
2. Create new RootQuestion with `summary = userMessage` (use first message as initial summary)
3. Call `EmbeddingProvider.embed(userMessage)` → embedding
4. Call `VectorSearchProvider.upsert(rootQuestionId, summary, embedding)` + `KeywordSearchProvider.upsert(rootQuestionId, summary)` — index the new root question
5. Create a RoutingDecision with empty candidates, `isNew: true`, for debug panel consistency
6. Jump to **Context Assembly** (step 7 below)

### Steady State (subsequent messages)

1. **User message arrives**
2. **Embedding generation**: `embedding = EmbeddingProvider.embed(userMessage)`
3. **Hybrid retrieval** via `router.ts` (parallel):
   - `VectorSearchProvider.search(embedding, topK)` → vector results (ranked by cosine similarity)
   - `KeywordSearchProvider.search(userMessage, topK)` → keyword results (ranked by BM25 score)
   - Score fusion via RRF (see formula above)
   - `router.ts` input: `(embedding, userMessage, topK, rrfK)` → output: `RoutingCandidate[]`
4. **No candidates or all fused scores below `minFusedScoreForJudge`?** → Create new RootQuestion (summary = userMessage), upsert indexes, skip to step 7
5. **LLM lightweight judgment** via `JudgeProvider.judge({ userMessage, candidates })`
   - Output: assign to existing question / create new / suggest links
   - JSON output guaranteed via Vercel AI SDK `generateObject` + zod schema in default implementation
6. **Link suggestion?** → Record in `suggestedLinks`, fire `onLinkSuggestion` callback (non-blocking, does not await)
7. **Context assembly** via `context.ts`:
   - `systemPrompt`
   - Target `rootQuestion` messages (via `StoreProvider.getMessagesByRootQuestion`)
   - Linked questions' messages (if any, via `QuestionLink` lookup)
   - Current user message
   - **Token budget**: if total estimated tokens > `maxContextTokens`, truncate oldest messages from linked questions first, then from main topic. System prompt and current user message are never truncated.
   - Token estimation: `chars / 4` (simple approximation, sufficient for routing purposes)
8. **Send to LLM** via `ChatProvider.streamChat`, store response as new Message under target RootQuestion
9. **Store RoutingDecision** for this user message
10. **Post-response maintenance:**
    - Increment `rootQuestion.messageCount`
    - If `messageCount % summaryUpdateInterval === 0`:
      - Call `ChatProvider.chat` with summary generation prompt (see below) + last N messages from this root question
      - `StoreProvider.updateRootQuestion(id, { summary: newSummary })`
      - `embedding = EmbeddingProvider.embed(newSummary)`
      - `VectorSearchProvider.upsert(rootQuestionId, newSummary, embedding)`
      - `KeywordSearchProvider.upsert(rootQuestionId, newSummary)`

### Responsibility Chain

- **Engine** (`engine.ts`): orchestrator. Calls `EmbeddingProvider.embed`, passes results to router and search providers. Calls `JudgeProvider` after retrieval. Calls `ChatProvider` for main chat and summary generation. Coordinates all store operations.
- **Router** (`router.ts`): pure retrieval logic. Input: `(embedding, userMessage, topK, rrfK, vectorSearch, keywordSearch)`. Output: `RoutingCandidate[]`. Calls search providers internally, performs RRF fusion. No other provider dependencies.
- **Context** (`context.ts`): pure assembly logic. Input: `(systemPrompt, messages[], userMessage, maxTokens)`. Output: `ChatMessage[]` + token metadata. No provider dependencies.
- Search providers never call other providers — they only store and retrieve.

## Prompt Templates

### Judge Prompt

The default `JudgeProvider` implementation accepts this template via constructor (`new AiSdkJudgeProvider({ promptTemplate?, model? })`). To use a different template without reimplementing the provider, pass a custom template string.

```
You are a conversation topic classifier. Given a user's new message and a list of
existing conversation topics, determine which topic this message belongs to,
or if it's a new topic entirely.

## Existing Topics
{{#each candidates}}
- [{{id}}] {{summary}} (relevance: {{fusedScore}})
{{/each}}

## New Message
{{userMessage}}

## Instructions
Respond in JSON:
{
  "targetId": "<id of matching topic, or null if new topic>",
  "isNew": <true if this is a new topic>,
  "reasoning": "<brief explanation>",
  "suggestedLinks": ["<id>", ...] // topics that may be related but aren't the same
}
```

Template uses simple `{{variable}}` interpolation (no Handlebars dependency). `{{#each}}` is implemented as a basic loop in the provider — iterate `candidates` array and format each line.

### Summary Generation Prompt

Used in post-response maintenance (step 10) to generate/update root question summaries.

```
Summarize the main topic of this conversation thread in one concise sentence (max 50 words).
Focus on the core question or task being discussed, not individual messages.

## Recent Messages
{{#each messages}}
[{{role}}]: {{content}}
{{/each}}

Respond with only the summary sentence, no additional text.
```

- Input: last `summaryContextSize` messages (default: 10) from the root question
- Output: plain text summary string

## Demo Application UI

### Layout (Desktop only, min-width: 1280px)

```
+----------------------------------------------------------+
|  Header: Project Name + Session Management                |
+----------+----------------------+------------------------+
|          |                      |                        |
| Tree     |   Main Chat Area     |   Debug Panel          |
| Sidebar  |   (streaming)        |   (collapsible)        |
| (collap- |                      |                        |
|  sible)  |  +----------------+  |  Confidence: [green]   |
|          |  | Message bubble |  |  "Matched Q1 (0.87)"   |
| * Q1     |  | [right-click:  |  |                        |
|   +- msg |  |  reassign msg] |  |  > Retrieval details   |
|   +- msg |  |                |  |  > LLM judgment        |
| * Q2     |  +----------------+  |  > Context preview     |
| * Q3     |                      |  > Timing breakdown    |
|          |  [Link banner]       |                        |
|          |  "Related to Q1?     |                        |
|          |   [Link] [Ignore]"   |                        |
|          |                      |                        |
|          |  +----------------+  |                        |
|          |  | Input box      |  |                        |
|          |  +----------------+  |                        |
+----------+----------------------+------------------------+
```

### Quick Panel (Cmd+K)

A floating overlay triggered by `Cmd+K`:
- All root questions in current session with summaries
- Search/filter by keyword
- Two-step linking: select source question → select target question → confirm
- Highlighted suggestions when the engine detects potential links
- Each question shows link count and message count

### Key Interactions

1. **Tree sidebar** (collapsible via toggle or `Cmd+B`)
   - Click a root question to filter chat view to that topic
   - Click "All" for full chronological timeline with color-coded topic tags + topic separator lines
   - Color legend visible at top of sidebar
2. **Debug panel** (collapsible via toggle or `Cmd+D`)
   - Click any user message → panel shows routing decision (fetched via `getRoutingDecisionByMessage`)
   - Top: confidence indicator (green/yellow/red) + one-line summary
   - Below: expandable sections for retrieval details, LLM judgment, context preview, timing
   - Cold start messages show empty candidates with "New topic (first message)" indicator
3. **Message reassignment** (routing error correction)
   - Right-click any message → "Move to..." → select target root question from dropdown
   - Reassignment calls `Engine.reassignMessage` which updates store and re-indexes affected root questions
   - Drag-to-reassign deferred to v1b (requires dnd-kit dependency)
4. **Link banner** (non-blocking toast)
   - Max 1 banner visible at a time (subsequent suggestions queue)
   - Options: [Link] [Ignore] [Later]
   - "Ignore" suppresses this specific pair for the session
   - Callback payload includes both IDs and summaries for display without extra queries
5. **Streaming** — Chat area renders assistant responses token-by-token via `ChatProvider.streamChat`

### Zustand Store Architecture

| Store | Responsibility | Persisted? |
|-------|---------------|------------|
| `sessionStore` | Current session, root questions list, messages | Yes (via StoreProvider) |
| `uiStore` | Panel visibility, selected root question, selected message | No |
| `debugStore` | Current routing decision display, expanded sections | No |

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js (App Router) | Full-stack + SSR |
| UI | Ant Design + @ant-design/x | Enterprise components + AI/Chat extensions |
| State | Zustand (3 slices) | Lightweight, clear separation of concerns |
| Default Vector | SQLite + sqlite-vec | Zero external deps, works out of the box |
| Default BM25 | SQLite FTS5 | Native SQLite full-text search |
| LLM | Vercel AI SDK + AI Gateway | Pluggable provider system, unified interface |
| JSON Output | Vercel AI SDK `generateObject` + zod | Guaranteed structured JSON from Judge |
| IDs | nanoid | Short, URL-safe, no external deps |
| Monorepo | pnpm workspace + Turborepo | pnpm preference + build optimization |
| Deployment | Local / Docker | SQLite requires persistent filesystem |

## Engine Configuration

```typescript
interface EngineConfig {
  // Providers
  vectorSearch: VectorSearchProvider
  keywordSearch: KeywordSearchProvider
  chat: ChatProvider
  judge: JudgeProvider
  embedding: EmbeddingProvider
  store: StoreProvider

  // Retrieval tuning
  topK: number                    // default: 5
  minFusedScoreForJudge: number   // default: 0.01 (see Score Fusion section for calibration)
  rrfK: number                    // RRF constant, default: 60

  // Context assembly
  maxContextTokens: number        // default: 4000, token budget for assembled context

  // Summary
  summaryUpdateInterval: number   // re-generate summary every N user messages, default: 5
  summaryContextSize: number      // number of recent messages to include in summary prompt, default: 10

  // Callbacks (non-blocking, fire-and-forget)
  onLinkSuggestion?: (suggestion: { sourceId: string; targetId: string; sourceSummary: string; targetSummary: string }) => void
  onRoutingComplete?: (decision: RoutingDecision) => void
}
```

## Scope Boundaries

### v1a (MVP Core)
- Core routing engine with all provider interfaces and public API
- Default SQLite + Vercel AI SDK implementations
- Demo app: chat area (streaming) + tree sidebar (collapsible) + debug panel (collapsible)
- Right-click message reassignment (routing error correction)
- Link banner with suggestions

### v1b (MVP Polish)
- Cmd+K quick panel with two-step linking
- Drag-to-reassign (dnd-kit)
- Session management UI (rename, delete)

### v2 (Future)
- Auto cross-topic dependency detection and context merging
- Degradation strategies (judge failure → fallback to score-only routing)
- Concurrency handling (message queue for rapid-fire inputs)
- Additional storage adapters (Turso, PostgreSQL + pgvector)
- Mobile responsive layout
- Batch embedding support (`embedBatch`)
- Routing decision aggregate analytics

## Default Implementations

### store-sqlite

SQLite tables:
- `sessions` — id, title, system_prompt, created_at, updated_at
- `root_questions` — id, session_id, summary, message_count, created_at, updated_at
- `messages` — id, session_id, root_question_id, role, content, created_at
- `routing_decisions` — id, message_id, final_target, suggested_links (JSON), candidates (JSON), llm_judgment (JSON), assembled_context (JSON), timing (JSON), created_at
- `question_links` — id, source_id, target_id, created_by, created_at

Vector index: sqlite-vec virtual table with dimensions from `EmbeddingProvider.dimensions`.

**Note:** Requires persistent filesystem; not compatible with serverless platforms (Vercel). Use local or Docker deployment.

### provider-ai-sdk
- **ChatProvider:** Vercel AI SDK `streamText` / `generateText` via AI Gateway
- **JudgeProvider:** Vercel AI SDK `generateObject` with zod schema for guaranteed JSON output. Prompt template configurable via constructor: `new AiSdkJudgeProvider({ promptTemplate?, model? })`
- **EmbeddingProvider:** Vercel AI SDK `embed` for vector generation, exposes `dimensions` from model config
- Supports model routing and fallback via AI Gateway configuration
- Judge and Chat can use different models (e.g. haiku for judge, sonnet for chat)
