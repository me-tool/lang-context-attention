// --- Entities (flat relational, no nested arrays) ---

export interface Session {
  id: string
  title: string
  systemPrompt: string
  createdAt: Date
  updatedAt: Date
}

export interface RootQuestion {
  id: string
  sessionId: string
  summary: string
  messageCount: number
  createdAt: Date
  updatedAt: Date
}

export interface Message {
  id: string
  sessionId: string
  rootQuestionId: string
  role: 'user' | 'assistant'
  content: string
  createdAt: Date
}

export interface QuestionLink {
  id: string
  sourceId: string
  targetId: string
  createdBy: 'user' | 'system'
  createdAt: Date
}

// --- Routing Decision ---

export interface RoutingDecision {
  id: string
  messageId: string
  candidates: RoutingCandidate[]
  llmJudgment: JudgeResult
  finalTarget: string
  suggestedLinks: string[]
  assembledContext: {
    messageIds: string[]
    estimatedTokens: number
  }
  timing: {
    retrievalMs: number
    judgmentMs: number
    totalMs: number
  }
  createdAt: Date
}

export interface RoutingCandidate {
  rootQuestionId: string
  vectorScore: number
  bm25Score: number
  fusedScore: number
}

// --- Provider I/O Types ---

export interface SearchResult {
  id: string
  score: number
  summary: string
}

export interface JudgeContext {
  userMessage: string
  candidates: { id: string; summary: string; fusedScore: number }[]
}

export interface JudgeResult {
  targetId: string | null
  reasoning: string
  isNew: boolean
  suggestedLinks: string[]
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// --- Engine Config ---

export interface EngineConfig {
  vectorSearch: VectorSearchProvider
  keywordSearch: KeywordSearchProvider
  chat: ChatProvider
  judge: JudgeProvider
  embedding: EmbeddingProvider
  store: StoreProvider

  topK?: number
  minFusedScoreForJudge?: number
  rrfK?: number
  maxContextTokens?: number
  summaryUpdateInterval?: number
  summaryContextSize?: number

  onLinkSuggestion?: (suggestion: {
    sourceId: string
    targetId: string
    sourceSummary: string
    targetSummary: string
  }) => void
  onRoutingComplete?: (decision: RoutingDecision) => void
}

export interface ResolvedEngineConfig extends EngineConfig {
  topK: number
  minFusedScoreForJudge: number
  rrfK: number
  maxContextTokens: number
  summaryUpdateInterval: number
  summaryContextSize: number
}

export const DEFAULT_CONFIG = {
  topK: 5,
  minFusedScoreForJudge: 0.01,
  rrfK: 60,
  maxContextTokens: 4000,
  summaryUpdateInterval: 5,
  summaryContextSize: 10,
} as const

// --- Provider Interfaces (re-exported from interfaces.ts for convenience) ---

import type {
  VectorSearchProvider,
  KeywordSearchProvider,
  ChatProvider,
  JudgeProvider,
  EmbeddingProvider,
  StoreProvider,
} from './interfaces.js'

export type {
  VectorSearchProvider,
  KeywordSearchProvider,
  ChatProvider,
  JudgeProvider,
  EmbeddingProvider,
  StoreProvider,
}

// --- Engine Result Types ---

export interface ProcessMessageResult {
  stream: AsyncIterable<string>
  routingDecision: RoutingDecision
  rootQuestionId: string
}

export interface ContextAssemblyResult {
  messages: ChatMessage[]
  messageIds: string[]
  estimatedTokens: number
}
